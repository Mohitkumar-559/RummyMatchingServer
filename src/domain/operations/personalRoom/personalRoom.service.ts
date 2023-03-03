import Mongoose from "mongoose"
import { ContestServer } from "app";
import { RedisStorage } from "database/redis";
import { GameWinningData, PersonalRoom, PersonalRoomEvent, PersonalRoomState, PlayerData } from "domain/entities/personalRoom/personalRoom.dto";
import PersonalRoomRepo from "domain/entities/personalRoom/personalRoom.repo";
import { IUser } from "domain/entities/users/user.dto";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { Socket } from "socket.io";
import UserService from "../user/user.service";
import { ContestData, GameMode, GameTicketData, PrivateBreakup, RoomType } from "domain/entities/contestRoom/contestRoom.dto";
import ContestRoomService, { GAMESERVER_TIMEOUT } from "../contestRoom/contestRoom.service";
import { Log } from "middleware/logger";
import { TransactionService } from "../transactions/transaction.service";
import { JoinContestResponse, PrivateTransactionTokenRequest } from "domain/entities/transactions/transaction.dto";

export const ROOM_EXPIRE_MS = 3000000
class PersonalRoomService {
    private static _instance: PersonalRoomService;
    private repo: PersonalRoomRepo;
    private redis: RedisStorage;

    static get Instance() {
        if (!this._instance) {
            this._instance = new PersonalRoomService();
        }
        return this._instance;
    }

    constructor() {
        this.repo = PersonalRoomRepo.Instance;
        this.redis = ContestServer.Instance.REDIS
    }

    public async createRoom(user: IUser, socket: Socket, amount: number, noOfPlayer: number, isOffline: boolean) {
        try {
            // Check room already exist
            let existingRoom = await this.checkAlreadyCreatedRoom(user._id)
            if (existingRoom) {
                this.log(existingRoom.roomCode, 'Existing room find', existingRoom);
                await UserService.Instance.joinSocketRoom(existingRoom.roomCode, socket);
                return new BaseHttpResponse(existingRoom, 'Room already created', ERROR_CODE.RESYNC);
            }

            // Check user balance:-
            await UserService.Instance.checkUserBalance(user.mid, amount)

            let personalRoom: PersonalRoom = {
                _id: new Mongoose.Types.ObjectId().toString(),
                amount: amount,
                capacity: noOfPlayer,
                createdBy: user._id,
                createdOn: Date.now(),
                players: [this.getUserInfo(user)],
                state: PersonalRoomState.CREATED,
                roomCode: await this.generateRoomCode(),
                isPrivate: true,
                isOffline: isOffline
            };
            let prizeBreakUp = await this.getWinningAmount(personalRoom, user);
            personalRoom.winningAmount = prizeBreakUp.wa;
            personalRoom.uniqueId = prizeBreakUp.uniqueId;
            personalRoom.prizeBreakup = prizeBreakUp.prizeBreakup;
            let personalContestDetails: any = await this.repo.getPersonalContestDetailsById(Number(personalRoom.uniqueId));
            let contestData: ContestData = personalContestDetails;
            console.log('opoppoppop', contestData);
            personalRoom.roomTimeoutMs = personalContestDetails.WaitingTime ? personalContestDetails.WaitingTime * 1000 : ROOM_EXPIRE_MS;

            // Save in redis and mongo
            await this.repo.savePersonalRoom(personalRoom);
            this.repo.createInMongo(personalRoom);
            this.log(personalRoom.roomCode, 'Room created=<', personalRoom, 'with data of', amount, noOfPlayer);
            UserService.Instance.joinSocketRoom(personalRoom.roomCode, socket);
            // Set timeout for room cancel
            // setTimeout(this.roomTimeout.bind(this, personalRoom.roomCode), personalRoom.roomTimeoutMs);
            this.log(personalRoom.roomCode, 'Room created');
            return new BaseHttpResponse(personalRoom, null, ERROR_CODE.OK);
        } catch (err) {
            if (err instanceof BaseHttpResponse) {
                return err
            }
            return new BaseHttpResponse(null, err.toString(), ERROR_CODE.DEFAULT)
        }

    }

    private getUserInfo(user: IUser): PlayerData {
        return {
            id: user._id,
            name: user.name,
            referCode: user.referCode,
            mid: user.mid
        }
    }

    private async checkAlreadyCreatedRoom(userId: string) {
        let existingRoom = await this.repo.getPersonalRoom(null, userId);
        if (existingRoom && existingRoom.createdOn > Date.now() - ROOM_EXPIRE_MS && [PersonalRoomState.CREATED, PersonalRoomState.ROOM_FULL].includes(existingRoom.state)) {
            return existingRoom;
        }
        return null
    }

    private async getWinningAmount(roomDetails: PersonalRoom, user:IUser): Promise<{wa: number, uniqueId: string, prizeBreakup: Array<PrivateBreakup>}>{
        try{
            let prizeBreakup = await this.repo.getPersonalContestPrizeBreakUp({
                UserId: user.mid,
                EntryFee: roomDetails.amount,
                NumberOfWinner: 1,
                ContestSize: roomDetails.capacity,
                InvitationCode: roomDetails.roomCode
            })
            this.log(roomDetails.roomCode, 'Winning amount calcualte is', prizeBreakup);
            console.log(prizeBreakup);
            return {
                wa: prizeBreakup.breakup[0].wa, 
                uniqueId: prizeBreakup.UniqueId.toString(),
                prizeBreakup: prizeBreakup.breakup
            };
        }catch(err){
            if (err instanceof BaseHttpResponse) {
                throw err
            }
            throw new BaseHttpResponse(null, err.toString(), ERROR_CODE.DEFAULT)
        }
    }

    public async joinRoom(user: IUser, socket: Socket, roomCode: string, isOffline: boolean) {
        try {
            this.log(roomCode, 'Join room request come from ', user.name);
            let roomDetails: PersonalRoom = await this.repo.getPersonalRoom(roomCode);
            if (!roomDetails) return new BaseHttpResponse(null, 'Invalid Room Code', ERROR_CODE.DEFAULT);
            else if (roomDetails && roomDetails.createdOn < Date.now() - roomDetails.roomTimeoutMs) {
                return new BaseHttpResponse(null, 'Room Code is expired', ERROR_CODE.DEFAULT);
            } else if (roomDetails.isOffline != isOffline){
                return new BaseHttpResponse(null, 'Invalid Room Type', ERROR_CODE.DEFAULT);
            }

            // Check if user already in the room?
            for (let i = 0; i < roomDetails.players.length; i++) {
                if (user._id == roomDetails.players[i].id) {
                    this.log(roomDetails.roomCode, 'User already joined', user.name, roomDetails);
                    await UserService.Instance.joinSocketRoom(roomDetails.roomCode, socket);
                    return new BaseHttpResponse(roomDetails, 'Already joined in this room', ERROR_CODE.RESYNC)
                }
            }
            // Check room state for new user
            if (roomDetails.state != PersonalRoomState.CREATED) {
                this.log(roomDetails.roomCode, `${user.name} try to join but room state is ${roomDetails.state}`)
                return new BaseHttpResponse(roomDetails, 'Invalid room state', ERROR_CODE.DEFAULT)
            }
            // Check user balance:-
            Log(roomDetails.roomCode, 'Checking balance of user', user.name);
            await UserService.Instance.checkUserBalance(user.mid, roomDetails.amount)

            if (roomDetails.players.length == roomDetails.capacity) { }
            roomDetails.players.push(this.getUserInfo(user));
            await this.repo.savePersonalRoom(roomDetails, true);
            await this.repo.findByIdAndUpdateInMongo(roomDetails._id, roomDetails, { lean: true });
            await UserService.Instance.joinSocketRoom(roomDetails.roomCode, socket);

            if (roomDetails.players.length == roomDetails.capacity) {
                this.log(roomDetails.roomCode, 'Room is full ready to start')
                roomDetails.state = PersonalRoomState.ROOM_FULL;
                await this.repo.savePersonalRoom(roomDetails, true);
                await this.repo.findByIdAndUpdateInMongo(roomDetails._id, roomDetails, { lean: true });
            }
            // Send socket event about new joinee
            let playerJoinResp = {
                id: roomDetails._id,
                playerId: user._id,
                playerName: user.name,
                state: roomDetails.state,
                createdBy: roomDetails.createdBy,
                roomCode: roomCode,
                players: roomDetails.players
            }
            let httpResp = new BaseHttpResponse(playerJoinResp, null, ERROR_CODE.OK)
            this.log(roomDetails.roomCode, 'Sending playerJoin event in room', httpResp);
            await UserService.Instance.emitInRoom(roomDetails.roomCode, PersonalRoomEvent.PLAYER_JOIN, httpResp)

            // Return roomDetails
            return new BaseHttpResponse(roomDetails, null, ERROR_CODE.OK)
        } catch (err) {
            Log(roomCode, 'Error in join room', err);
            if (err instanceof BaseHttpResponse) {
                return err
            }
            return new BaseHttpResponse(null, err.toString(), ERROR_CODE.DEFAULT)
        }

    }

    public async startGame(user: IUser, socket: Socket, roomCode: string) {
        this.log(roomCode, 'Start game event come')
        let roomDetails = await this.repo.getPersonalRoom(roomCode);
        if (!roomDetails) {
            return new BaseHttpResponse(null, 'Invalid room', ERROR_CODE.DEFAULT)
        }
        if (roomDetails.state == PersonalRoomState.GAME_START) {
            return new BaseHttpResponse(roomDetails, 'Game is running', ERROR_CODE.RESYNC)
        } else if (roomDetails.state != PersonalRoomState.ROOM_FULL) {
            return new BaseHttpResponse(roomDetails, 'Invalid room state', ERROR_CODE.DEFAULT)
        } else if(roomDetails.isOffline){
            return new BaseHttpResponse(roomDetails, 'Invalid room type', ERROR_CODE.DEFAULT)
        }
        if (roomDetails.createdBy != user._id) {
            return new BaseHttpResponse(null, 'Invalid user', ERROR_CODE.DEFAULT)
        }

        let gameId = new Mongoose.Types.ObjectId().toString();
        let personalContestDetails = await this.repo.getPersonalContestDetailsById(Number(roomDetails.uniqueId));
        let ticketData: GameTicketData;
        for (let i = 0; i < roomDetails.players.length; i++) {
            let currentPlayer = roomDetails.players[i]
            ticketData = {
                gameId: gameId,
                capacity: roomDetails.capacity,
                isPrivate: true,
                playerPos: i,
                serverIp: await ContestRoomService.Instance.getAvailableServer(),
                gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                joiningAmount: roomDetails.amount,
                contestId: '-3',
                gamePlayTime: personalContestDetails.Duration * 1000,
                uniqueId: roomDetails.uniqueId
            }
            let joinResp = await UserService.Instance.joinGame(currentPlayer.id, ticketData);
        }
        this.log(roomDetails.roomCode, 'Set state to game start')
        roomDetails.state = PersonalRoomState.GAME_START;
        roomDetails.gameId = ticketData.gameId,
            roomDetails.serverIp = ticketData.serverIp
        await this.repo.savePersonalRoom(roomDetails, false, (roomDetails.roomTimeoutMs / 1000) + 480)
        await this.repo.findByIdAndUpdateInMongo(roomDetails._id, roomDetails, { lean: true });

        let httpResp = new BaseHttpResponse(ticketData, null, ERROR_CODE.OK)
        this.log(roomDetails.roomCode, 'Sending joinGame event in room', httpResp);
        UserService.Instance.emitInRoom(roomDetails.roomCode, PersonalRoomEvent.JOIN_GAME, httpResp)
        return httpResp;

    }

    public async startOfflineRoom(user: IUser, socket: Socket, roomCode: string) {
        this.log(roomCode, 'Start offline game event come')
        let roomDetails = await this.repo.getPersonalRoom(roomCode);
        if (!roomDetails) {
            return new BaseHttpResponse(null, 'Invalid room', ERROR_CODE.DEFAULT)
        }
        if (roomDetails.state == PersonalRoomState.GAME_START) {
            return new BaseHttpResponse(roomDetails, 'Game is running', ERROR_CODE.RESYNC)
        } else if (roomDetails.state != PersonalRoomState.ROOM_FULL) {
            return new BaseHttpResponse(roomDetails, 'Invalid room state', ERROR_CODE.DEFAULT)
        } else if(!roomDetails.isOffline){
            return new BaseHttpResponse(roomDetails, 'Invalid room type', ERROR_CODE.DEFAULT)
        }
        if (roomDetails.createdBy != user._id) {
            return new BaseHttpResponse(null, 'Invalid user', ERROR_CODE.DEFAULT)
        }
        const transactionService = TransactionService.Instance;
        let gameId = new Mongoose.Types.ObjectId().toString();

        this.log(roomDetails.roomCode, 'Set state to game start', )
        roomDetails.state = PersonalRoomState.GAME_START;
        roomDetails.gameId = gameId
        roomDetails.serverIp = null
        await this.repo.savePersonalRoom(roomDetails, false, (roomDetails.roomTimeoutMs / 1000) + 480)
        await this.repo.findByIdAndUpdateInMongo(roomDetails._id, roomDetails, { lean: true });
        var data: PrivateTransactionTokenRequest = {
            userList: [],
            gameserverid: gameId,
            uniqueid: Number(roomDetails.uniqueId),
            amt: roomDetails.amount,
            mba: 0,
            gameMode: GameMode.TIME_BASED
        }
        for (let i = 0; i < roomDetails.players.length; i++) {
            let player = roomDetails.players[i]
            data.userList.push({
                UserId: player.id,
                UserLoginId: player.mid,
                ReferCode: player.referCode
            })
        }
        const deductBalanceResponse: JoinContestResponse = await transactionService.JoinOfflineContest(data, roomDetails.roomCode);

        this.log(roomDetails.roomCode, `Deduct bal response for draw money`, deductBalanceResponse);
        // Create ludo game data
        let resp = {
            _id: gameId,
            players: roomDetails.players.map((p, pIndex) => {
                console.log('Player data =>', p);
                return {
                    userId: p.id,
                    name: p.name,
                    color: pIndex + 1,
                    pos: pIndex * 2,
                    pawnStack: [
                        -1,
                        -1,
                        -1,
                        -1
                    ],
                    state: 2,
                    hasKilled: false,
                    skip: 0,
                    score: 0,
                    rank: -1,
                    id: p.mid,
                    referCode: p.referCode,
                    isExitPlayer: false
                }
            }),
            capacity: roomDetails.capacity,
            isFull: true,
            state: 2,
            isRunning: true,
            turnIndex: 0,
            phase: 1,
            turnTime: 13000,
            timeRemaining: -1,
            gameTime: 28000,
            roomId: deductBalanceResponse.RoomId,
            gameStartTime: Date.now(),
            gameStartIn: 0,
            gameMode: GameMode.TIME_BASED,
            gameTurnRemaining: 0
        };

        let httpResp = new BaseHttpResponse(resp, null, ERROR_CODE.OK)
        this.log(roomDetails.roomCode, 'Resp of startOfflineGame ', httpResp)
        return httpResp;
    }

    public async leaveRoom(user: IUser, socket: Socket, roomCode: string) {
        let isExit = false;
        let roomDetails = await this.repo.getPersonalRoom(roomCode);
        this.log(roomCode, 'Leave room request come', user.name)

        if (!roomDetails) return new BaseHttpResponse(null, 'Invalid Room Code', ERROR_CODE.DEFAULT)
        if (roomDetails.state != PersonalRoomState.CREATED) {
            this.log(roomCode, 'Invald room state of leave room of ', user.name, roomDetails.state);
            return new BaseHttpResponse(null, 'Invalid room state', ERROR_CODE.DEFAULT)
        }
        for (let i = 0; i < roomDetails.players.length; i++) {
            if (roomDetails.players[i].id == user._id) {
                isExit = true;
                roomDetails.players.splice(i, 1);
            }
        }
        if (isExit) {
            this.log(roomCode, 'Removing player from array', roomDetails);
            if (user._id == roomDetails.createdBy) {
                this.log(roomCode, 'Master player leave room');
                roomDetails.state = PersonalRoomState.CANCELLED;
            }
            await this.repo.savePersonalRoom(roomDetails, true);
            await this.repo.findByIdAndUpdateInMongo(roomDetails._id, roomDetails, { lean: true });

            let playerLeaveResp = {
                id: roomDetails._id,
                playerId: user._id,
                playerName: user.name,
                state: roomDetails.state,
                createdBy: roomDetails.createdBy,
                roomCode: roomCode,
                players: roomDetails.players
            }
            let httpResp = new BaseHttpResponse(playerLeaveResp, null, ERROR_CODE.OK)
            this.log(roomDetails.roomCode, 'Sending playerLeave event in room', httpResp);
            await UserService.Instance.emitInRoom(roomDetails.roomCode, PersonalRoomEvent.PLAYER_LEAVE, httpResp)

            // Return roomDetails
            return new BaseHttpResponse(roomDetails, null, ERROR_CODE.OK)
        }
        return new BaseHttpResponse(null, 'Player not in this room', ERROR_CODE.DEFAULT);
    }

    async getRoom(user: IUser, socket: Socket, roomCode: string, isOffline: boolean) {
        let roomDetails = await this.repo.getPersonalRoom(roomCode);
        this.log(roomCode, 'Get room request come from ', user.name, roomDetails);
        if (!roomDetails) {
            return new BaseHttpResponse(null, 'Invalid room', ERROR_CODE.DEFAULT)
        }
        else if (roomDetails.state == PersonalRoomState.CANCELLED) {
            return new BaseHttpResponse(null, 'Room cancelled', ERROR_CODE.DEFAULT)
        } else if(roomDetails.isOffline != isOffline){
            return new BaseHttpResponse(null, 'Invalid room', ERROR_CODE.DEFAULT)
        }
        await UserService.Instance.joinSocketRoom(roomDetails.roomCode, socket);
        if (roomDetails.state == PersonalRoomState.GAME_START && !roomDetails.isOffline) {
            this.log(roomCode, 'Sending joinGame event from getRoom');
            await socket.emit(PersonalRoomEvent.JOIN_GAME, new BaseHttpResponse(roomDetails, null, ERROR_CODE.RESYNC))
        }
        return new BaseHttpResponse(roomDetails, null, ERROR_CODE.OK)
    }

    async getRoomPrizeBreakup(user: IUser, socket: Socket, roomCode: string) {
        let roomDetails = await this.repo.getPersonalRoom(roomCode);
        this.log(roomCode, 'Get room prize breakup request come from ', user.name, roomDetails);
        if (!roomDetails) {
            return new BaseHttpResponse(null, 'Invalid room', ERROR_CODE.DEFAULT)
        } else if (roomDetails.state == PersonalRoomState.ROOM_FULL) {
            return new BaseHttpResponse(null, 'Room Full', ERROR_CODE.DEFAULT)
        } else if (roomDetails.state == PersonalRoomState.GAME_START) {
            return new BaseHttpResponse(null, 'Game Started', ERROR_CODE.DEFAULT)
        }
        let resp = {
            amount: roomDetails.amount,
            winningAmount: roomDetails.winningAmount,
            prizeBreakup: roomDetails.prizeBreakup
        }
        return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
    }

    async declareResult(data: GameWinningData){
        console.log('Reuqest come to declare result ', data);
        data.ContestId = '-3'
        data.IsPrivate = true
        data.IsOffline = true
        let ack = await ContestServer.Instance.RabbitMQ.pushToWinningQueue(data);
        this.log(data.RoomCode, 'Winning data ack of rabit mq', ack, data)
        return new BaseHttpResponse(null, 'Success', ERROR_CODE.OK)
    }

    async saveGameLog(data: any, roomCode: string){
        data.isOffline = true
        let ack = await ContestServer.Instance.RabbitMQ.pushToLogQueue(data);
        this.log(roomCode, 'Log data of offline room', ack)
        return new BaseHttpResponse(null, 'Success', ERROR_CODE.OK)
    }

    async cancelOfflineRoom(roomId: string, user: IUser){
        try {
            console.log('Request come to cacnel Room', roomId);
            let resp = await this.repo.cancelRoom(roomId, user.mid.toString())
            return new BaseHttpResponse(resp, "Success", ERROR_CODE.OK)
        }
        catch (e) {
            return new BaseHttpResponse("", (e as Error).message, ERROR_CODE.EXCEPTION);
        }
    }

    //@Done: Removed due to memory issues.
    async roomTimeout(roomCode: string) {
        let roomDetails = await this.repo.getPersonalRoom(roomCode);
        this.log(roomCode, 'Wait timeout for room', roomDetails)

        if (roomDetails.state == PersonalRoomState.CREATED || roomDetails.state == PersonalRoomState.ROOM_FULL) {
            roomDetails.state = PersonalRoomState.CANCELLED;
            await this.repo.savePersonalRoom(roomDetails, true);
            await this.repo.findByIdAndUpdateInMongo(roomDetails._id, roomDetails, { lean: true });
            this.log(roomCode, 'Sending roomTimout event');
            let httpResp = new BaseHttpResponse(null, 'Room timeout', ERROR_CODE.DEFAULT)
            await UserService.Instance.emitInRoom(roomDetails.roomCode, PersonalRoomEvent.ROOM_TIMEOUT, httpResp)
        }
    }

    public async generateRoomCode(): Promise<string> {
        let MAX = 99999999, MIN = 10000000;
        let roomCode = Math.floor((Math.random() * (MAX - MIN) + MIN)).toString();
        if (await this.repo.isRoomExist(roomCode)) {
            return await this.generateRoomCode();
        }
        return roomCode
    }

    public log(roomCode: string, ...args: any) {
        Log(roomCode, args);
        return
    }

}

export default PersonalRoomService