import { ContestServer } from "app";
import { RedisStorage } from "database/redis";
import { RedisTimeout } from "database/redis/redis.dto";
import { RedisKeys } from "database/redis/redis.keys";
import SqlDB from "database/sql";
import { PersonalContestData, PersonalRoom, RoomStatus } from "./personalRoom.dto";
import _ from 'lodash'
import { MongoDb } from "database/mongo";
import { PrivateBreakup } from "../contestRoom/contestRoom.dto";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { ROOM_EXPIRE_MS } from "domain/operations/personalRoom/personalRoom.service";

class PersonalRoomRepo {
    private static _instance: PersonalRoomRepo;
    private redis: RedisStorage
    private sql: SqlDB
    private mongoDb: MongoDb

    static get Instance() {
        if (!this._instance) {
            this._instance = new PersonalRoomRepo();
        }
        return this._instance;
    }

    constructor() {
        this.redis = ContestServer.Instance.REDIS
        this.sql = ContestServer.Instance.SQL_DB
        this.mongoDb = ContestServer.Instance.MongoDB;
    }

    public async savePersonalRoom(roomData: PersonalRoom, onlyUpdate: boolean = false, roomExpire: number = null) {
        let parsedData: any = _.clone(roomData);
        parsedData.players = JSON.stringify(parsedData.players)
        parsedData.prizeBreakup = JSON.stringify(parsedData.prizeBreakup)
        parsedData.amount = roomData.amount.toString()
        parsedData.winningAmount = roomData.winningAmount.toString()
        //
        let roomKey = RedisKeys.getPersonalRoomKey(roomData.roomCode);
        let userKey = RedisKeys.getUserPersonalRoomKey(roomData.createdBy);
        let query = this.redis.INSTANCE.pipeline();
        query.hmset(roomKey, parsedData).set(userKey, roomData.roomCode);
        
        // In case of update do not set expiry time of key;
        if(!roomExpire){
            roomExpire = roomData.roomTimeoutMs/1000
        }
        
        if (!onlyUpdate) {
            query.expire(roomKey, roomExpire).expire(userKey, roomExpire);
        }
        return await query.exec();

    }

    public async getPersonalRoom(roomCode: string = null, userId: string = null): Promise<PersonalRoom> {
        if (!roomCode && !userId) {
            return null
        }
        if (!roomCode) {
            roomCode = await this.getRoomCode(userId)
            if (!roomCode) {
                return null
            }
        }
        let roomKey = RedisKeys.getPersonalRoomKey(roomCode);
        let data = await this.redis.hgetall(roomKey);
        if (data && data._id) {
            let resp: PersonalRoom = {
                _id: data._id,
                state: parseInt(data.state),
                capacity: parseInt(data.capacity),
                players: JSON.parse(data.players),
                createdBy: data.createdBy,
                createdOn: parseInt(data.createdOn),
                amount: Number(data.amount),
                roomCode: data.roomCode,
                gameId: data.gameId,
                serverIp: data.serverIp,
                winningAmount: Number(data.winningAmount),
                uniqueId: data.uniqueId,
                prizeBreakup: JSON.parse(data.prizeBreakup),
                roomTimeoutMs: Number(data.roomTimeoutMs),
                isPrivate: true,
                isOffline: data.isOffline == 'true' ? true : false
            }
            return resp;
        }
        return null
    }

    public async getRoomCode(userId: string) {
        if (!userId) {
            return null
        }
        let userKey = RedisKeys.getUserPersonalRoomKey(userId);
        let roomCode = await this.redis.INSTANCE.get(userKey);
        return roomCode
    }

    public async isRoomExist(roomCode: string) {
        let roomKey = RedisKeys.getPersonalRoomKey(roomCode);
        return await this.redis.INSTANCE.exists(roomKey);
    }

    async createInMongo(data: any) {
        return this.mongoDb.personalRoomMode.create(data);
    }
    async findOneInMongo(id: any, projection: any, options: any) {
        return this.mongoDb.personalRoomMode.findById(id, projection, { ...options, lean: true });
    }
    async findByIdAndUpdateInMongo(id: any, data: any, options: any) {
        return this.mongoDb.personalRoomMode.findByIdAndUpdate(id, data, { ...options, lean: true });
    }
    async findByIdAndDeleteInMongo(id: any) {
        return this.mongoDb.personalRoomMode.findByIdAndDelete(id);
    }

    async getPersonalContestPrizeBreakUp(data: any) {
        console.log(data)
        const proc_name = "PROC_GET_PRIVATE_CONTEST_PRIZE_BREAKUP";
        let param = "@UserId=" + data.UserId + ", @EntryFee=" + data.EntryFee + ", @NumberOfWinner=" + data.NumberOfWinner;
        param = param + ", @ContestSize=" + data.ContestSize + ", @InvitationCode='" + + data.InvitationCode + "'";
        var UniqueId = 0;
        var prizeBreakUp: PrivateBreakup[] = [];
        var resp = await this.sql.GetDataFromCasualGame(proc_name, param)
        if (!resp) {
            throw new BaseHttpResponse(null, "No prize breakup found", ERROR_CODE.DEFAULT)
        }

        if (resp.length > 0) {
            UniqueId = resp[0].UniqueId;
            for (let obj of resp) {
                var pbup = new PrivateBreakup();
                pbup.wf = parseInt(obj.wf);
                pbup.wt = parseInt(obj.wf);
                pbup.wa = obj.wa;
                prizeBreakUp.push(pbup);
            }
        }

        let response = {
            "UniqueId": UniqueId,
            "breakup": prizeBreakUp
        };

        return response;
    }

    async getPersonalContestDetailsById(uniqueId: number) {
        const proc_name = "PROC_GET_LUDO_PRIVATE_CONTEST_DETAILS_BY_ID";
        let param = "@UniqueId=" + uniqueId;

        var resp = await this.sql.GetDataFromCasualGame(proc_name, param)
        if (!resp || resp.length <= 0) {
            throw new BaseHttpResponse(null, "No details found", ERROR_CODE.DEFAULT)
        }
        return <PersonalContestData>resp[0];
    }

    async cancelRoom(roomId: string, userId:string){
        const proc_name = "PROC_UpdateContestUserStatus";
        const param = `@RoomId=${roomId}, @userId=${userId}, @Status=${RoomStatus.Cancel}`;
        
        var resp = await this.sql.GetDataFromCasualGame(proc_name, param)
        console.log('Resp of cancel room sp=>', resp, proc_name, param)
        if (!resp) {
            throw new BaseHttpResponse(null, "Unable to cancel room: DB Error", ERROR_CODE.DEFAULT)
        }

        return resp;
    }
}

export default PersonalRoomRepo;