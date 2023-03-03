import { ContestServer } from "app";
import { RedisStorage } from "database/redis";
import { RedisTimeout } from "database/redis/redis.dto";
import { RedisKeys } from "database/redis/redis.keys";
import SqlDB from "database/sql";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { IUser, RunningContestData } from "./user.dto";

class UserRepo {
    private static _instance: UserRepo;
    private redis: RedisStorage
    private sql: SqlDB

    static get Instance() {
        if (!this._instance) {
            this._instance = new UserRepo();
        }
        return this._instance;
    }

    constructor() {
        this.redis = ContestServer.Instance.REDIS
        this.sql = ContestServer.Instance.SQL_DB
    }

    async getUserBalance(userId: number) {
        const proc_name = "PROC_GET_UserBalanceForContestJoin";
        let Param = "@UserId=" + userId
        var Result = await this.sql.GetDataFromTransaction(proc_name, Param);
        return Result
    }

    async addInContestRoom(contestId: string, timeSlot: number, userId: string) {
        let redisKey = RedisKeys.getContestRoomJoineduser(contestId, timeSlot)
        let resp = await this.redis.sadd(redisKey, userId);
        return resp;
    }

    async addInActiveUser(contestId: string, timeSlot: number, userId: string) {
        let redisKey = RedisKeys.getContestRoomActiveuser(contestId, timeSlot)
        let resp = await this.redis.sadd(redisKey, userId);
        return resp;
    }

    async existInContestRoom(contestId: string, timeSlot: number, userId: string) {
        let redisKey = RedisKeys.getContestRoomJoineduser(contestId, timeSlot)
        let resp = await this.redis.sismember(redisKey, userId);
        return resp;
    }

    async existInActiveUser(contestId: string, timeSlot: number, userId: string) {
        let redisKey = RedisKeys.getContestRoomActiveuser(contestId, timeSlot)
        let resp = await this.redis.sismember(redisKey, userId);
        return resp;
    }

    async getUnactivePlayer(contestId: string, timeSlot: number) {
        let joinedPlayerKey = RedisKeys.getContestRoomJoineduser(contestId, timeSlot)
        let activePlayerKey = RedisKeys.getContestRoomActiveuser(contestId, timeSlot)
        let unactivePlayers = this.redis.sdiff(joinedPlayerKey, activePlayerKey);
        return unactivePlayers
    }

    async setProfile(data: IUser) {
        let redisKey = RedisKeys.getProfileKey(data._id);
        return await this.redis.hmset(redisKey, data, RedisTimeout.ONE_DAY);
    }
    async fetchProfile(playerId: string) {
        let redisKey = RedisKeys.getProfileKey(playerId);
        return await this.redis.hgetall(redisKey);
    }

    async getRunningContest(userId: string) {
        let data = await this.redis.hgetall(RedisKeys.getRunningContest(userId));
        let resp: RunningContestData = null
        if (data && data.contestId) {
            resp = {
                contestId: data.contestId,
                timeSlot: parseInt(data.timeSlot),
                ticketAssigned: data.ticketAssigned == 'true' ? true : false,
                ticketData: data.ticketData ? JSON.parse(data.ticketData): null
            }
        }
        return resp
    }

    async setRunningContest(userId: string, data: RunningContestData) {
        let redisKey = RedisKeys.getRunningContest(userId);
        return await this.redis.hmset(redisKey, data);
    }

    async isTester(userId: string){
        let redisKey = RedisKeys.LudoTesters();
        let isExist = await this.redis.sismember(redisKey, userId)
        console.log('Check tester', isExist, userId)
        return !!isExist
    }

    async isBlockedUser(userId: number){
        let redisKey = RedisKeys.BlockedUser();
        let isBlocked = await ContestServer.Instance.REDIS.hget(redisKey, userId.toString())
        console.error('User is blocked:-', userId, isBlocked);
        return isBlocked
    }
    
    async isPresetUser(userId: string, contestId: string){
        
        let resp = false
        let contestRedisKey;
        let redisKey = RedisKeys.PresetUser();
        let isPreset = await ContestServer.Instance.REDIS.hget(redisKey, userId.toString())
        if(isPreset){
            contestRedisKey = RedisKeys.PresetUserContest();
            let isPresetContest = await ContestServer.Instance.REDIS.hget(contestRedisKey, contestId)
            if(isPresetContest){
                resp = true
            }
        }
        console.error('User is preset:-', userId, contestId, isPreset, resp, redisKey, contestRedisKey);
        return resp
    }

    async getXfacUser(amount: number, mba: number, opponentId: number, timeSlot: string) {
        try {
            const proc_contest_name = "PROC_GetUserForXFacPlay_V2"
            let param_contest = `@Amount=${amount}, @BonusApplicable=${mba}, @UserId=${opponentId}, @RequestFrom='${timeSlot}'`;
            console.log(proc_contest_name, param_contest)
            let resp = await this.sql.GetDataFromTransaction(proc_contest_name, param_contest);
            console.log('RESP is ' ,resp)
            if (resp && resp.length > 0) {
                if(resp[0].ResponseStatus != 1){
                    throw new Error("Unable to get xfac for user");
                }
                return {
                    userId: resp[0].UserId,
                    xFacLevel: resp[0].XFacLevel,
                    userMid: resp[0].UserLoginId,
                    xFacLogId: resp[0].XFacLogId
                }
            }
            throw new Error("Unable to fetch data from PROC_GetUserForXFacPlay_V2")
        } catch (err) {
            console.log('Error in get xfac user', err);
            throw err
        }
    }

    async freeXfacUSer(userMid: number){
        try {
            const proc_contest_name = "PROC_UPDATE_LUDO_XFac_USER_STATUS"
            let param_contest = `@UserId=${userMid}`;
            await this.sql.GetDataFromTransaction(proc_contest_name, param_contest);
        } catch (err) {
            console.log('Error in get xfac user', err);
            throw err
        }
    }

}

export default UserRepo;