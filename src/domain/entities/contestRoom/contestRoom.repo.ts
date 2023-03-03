import { ContestServer } from "app";
import { RedisStorage } from "database/redis";
import { RedisTimeout } from "database/redis/redis.dto";
import { RedisKeys } from "database/redis/redis.keys";
import SqlDB from "database/sql";
import UserService from "domain/operations/user/user.service";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { Category, ContestData, ContestRoomData, Breakup, PrivateBreakup } from "./contestRoom.dto";

class ContestRoomRepo {
    private static _instance: ContestRoomRepo;
    private redis: RedisStorage
    private sql: SqlDB

    static get Instance() {
        if (!this._instance) {
            this._instance = new ContestRoomRepo();
        }
        return this._instance;
    }

    constructor() {
        this.redis = ContestServer.Instance.REDIS
        this.sql = ContestServer.Instance.SQL_DB
    }



    async getContestById(contestId: string) {
        const cacheKey = RedisKeys.getContestDetailKey(contestId);
        const procName = "PROC_GET_GameContestsByContestId_V2";
        const procParam = `@ContestId=${contestId}`
        var contestData: ContestData;
        contestData = await this.redis.get(cacheKey)
        // console.log('FETCHING DETAILS OF CONTEST', contestId, contestData);

        // If data is in cache then parse and return it
        if (!contestData) {
            let resp = await this.sql.GetDataFromCasualGame(procName, procParam);
            if (!resp || resp?.length <= 0) {
                throw new BaseHttpResponse(null, "No contest found", ERROR_CODE.DEFAULT)
            }
            contestData = resp[0];
            let contestCounters = await this.getPlayerJoinCounter()
            if(contestCounters[parseInt(contestId)] != undefined)
                contestData.total_joined = contestCounters[parseInt(contestId)];
            else
                contestData.total_joined = 0;
            await this.redis.set(cacheKey, contestData);
        }
        return contestData;

    }

    async getContest(gameId: string) {
        const cacheKey = RedisKeys.ContestDetails(gameId);
        const procName = "PROC_GET_GameContests_V2";
        const procParam = `@GameId=${gameId}`
        var contestData: ContestData;
        contestData = await this.redis.get(cacheKey)

        // If data is in cache then parse and return it
        if (!contestData) {
            let resp = await this.sql.GetDataFromCasualGame(procName, procParam);
            if (!resp) {
                throw new BaseHttpResponse(null, "No contest found", ERROR_CODE.DEFAULT)
            }
            contestData = resp;
            await this.redis.set(cacheKey, contestData);
        }

        return contestData;
    }

    async getContestCategorisationInCache(gameId: number) {
        const cacheKey = RedisKeys.ContestCategorization(gameId.toString());
        const proc_name = "PROC_GET_ContestCategorisation";
        const param = "@GameId=" + gameId;
        var recacheCategory: Category[];
        recacheCategory = await this.redis.get(cacheKey)
        if (!recacheCategory) {
            var resp = await this.sql.GetDataFromCasualGame(proc_name, param);
            if (!resp) {
                throw new BaseHttpResponse(null, "No category found", ERROR_CODE.DEFAULT)
            }
            recacheCategory = resp;
            await this.redis.set(cacheKey, recacheCategory);
        }
        return recacheCategory;
    }

    async getContestPrizeBreakUp(contestId: number) {
        const cacheKey = RedisKeys.ContestPrizeBreakUp(contestId.toString());
        const proc_name = "PROC_GET_ContestPrizeBreakup";
        const param = "@ContestId=" + contestId;
        var prizeBreakUp: Breakup[];
        prizeBreakUp = await this.redis.get(cacheKey);

        if (!prizeBreakUp || prizeBreakUp?.length == 0) {

            var resp = await this.sql.GetDataFromCasualGame(proc_name, param)
            if (!resp) {
                throw new BaseHttpResponse(null, "No prize breakup found", ERROR_CODE.DEFAULT)
            }
            prizeBreakUp = resp;
            await this.redis.set(cacheKey, prizeBreakUp);
        }

        return prizeBreakUp;
    }

    async searchRoom(contestId: string, timeSlot: number) {
        let data = await this.redis.hgetall(RedisKeys.getContestRoomKey(contestId, timeSlot));
        let resp = null
        if (data && data._id) {
            resp = {
                _id: data._id,
                contestId: data.contestId,
                timeSlot: parseInt(data.timeSlot), // When player joining starts in contest
                startTime: parseInt(data.startTime), // When game start for players
                state: parseInt(data.state),
                capacity: parseInt(data.capacity),
                matchMakingFunctionRun: parseInt(data.matchMakingFunctionRun)
            }
        }
        return resp
    }
    async createRoom(contestRoomData: ContestRoomData) {
        return await this.redis.hmset(RedisKeys.getContestRoomKey(contestRoomData.contestId, contestRoomData.timeSlot), contestRoomData, RedisTimeout.ONE_DAY);
    }

    async updateContestRoom(contestId: string, timeSlot: number, data: any) {
        let redisKey = RedisKeys.getContestRoomKey(contestId, timeSlot)
        return await this.redis.hmset(redisKey, data);
    }

    async incJoinPlayerCounter(contestId: string, inc: number) {
        let redisKey = RedisKeys.contestRoomCounter();
        return await this.redis.hincrby(redisKey, contestId, inc)
    }

    async resetJoinPlayerCounter(contestId: string) {
        console.log('Reseting counter for ', contestId)
        let data: any = {}
        data[contestId] = 0
        let redisKey = RedisKeys.contestRoomCounter();
        return await this.redis.hmset(redisKey, data);
    }

    async getTotalPlayerCount(contestId: string, timeSlot: number) {
        let redisKey = RedisKeys.getContestRoomJoineduser(contestId, timeSlot)
        return await this.redis.scard(redisKey);
    }

    async getActivePlayerCount(contestId: string, timeSlot: number) {
        let redisKey = RedisKeys.getContestRoomActiveuser(contestId, timeSlot)
        return await this.redis.scard(redisKey);
    }

    async addContestTickets(contestId: string, timeSlot: number, data: string[]) {
        let redisKey = RedisKeys.getContestTicketQueue(contestId, timeSlot)
        return await this.redis.rpush(redisKey, data);
    }

    async addUserSpecificTickets(contestId: string, timeSlot: number, data: any) {
        let redisKey = RedisKeys.getUserSpecificTicketQueue(contestId, timeSlot)
        return await this.redis.hmset(redisKey, data);
    }

    async popGameTicket(contestId: string, timeSlot: number) {
        let redisKey = RedisKeys.getContestTicketQueue(contestId, timeSlot)
        return await this.redis.rpop(redisKey)
    }

    async fetchUserSpecificGameTicket(contestId: string, timeSlot: number, userId: string) {
        let redisKey = RedisKeys.getUserSpecificTicketQueue(contestId, timeSlot)
        let resp = await this.redis.hpop(redisKey, userId)
        console.log('Presence TICKET', resp);
        return resp
    }

    async getGameTicket(contestId: string, timeSlot: number) {
        let redisKey = RedisKeys.getContestTicketQueue(contestId, timeSlot)
        return await this.redis.INSTANCE.lrange(redisKey, 0, -1)
    }

    async getUserSpecificTicket(contestId: string, timeSlot: number) {
        let redisKey = RedisKeys.getUserSpecificTicketQueue(contestId, timeSlot)
        return await this.redis.INSTANCE.hgetall(redisKey)
    }

    async incFunctionCount(contestId: string, timeSlot: number, counterName: string, incBy: number = 1) {
        let redisKey = RedisKeys.getContestRoomKey(contestId, timeSlot);
        return await this.redis.hincrby(redisKey, counterName, incBy)
    }

    async getPlayerJoinCounter() {
        let redisKey = RedisKeys.contestRoomCounter();
        return await this.redis.hgetall(redisKey);
    }

    async getPriorityTimeFrameV2(cid: string) {
        const cacheKey = RedisKeys.PriorityTimeFrameV2("1", cid);
        var timeFrame: any[];
        timeFrame = await this.redis.get(cacheKey)
        if (!timeFrame) {
            const proc_name = "PROC_GET_PRIORITY_TIME_FRAME";
            const param = `@ContestId=${cid}`
            var resp = await this.sql.GetDataFromCasualGame(proc_name, param);
            if (!resp) {
                throw new BaseHttpResponse(null, "No time frame available", ERROR_CODE.DEFAULT)
            }
            timeFrame = resp.map(function (obj: any) {
                return {
                    IsUserActive: obj.IsUserActive,
                    IsXFacUserActive: obj.IsXFacUserActive,
                    FirstPriorityId: obj.FirstPriorityId,
                    ToDate: obj.ToDate
                }
            });
            if (resp.length > 0)
                await this.redis.set(cacheKey, timeFrame, parseInt(resp[0].TimeExpire));
        }
        if (timeFrame && timeFrame.length > 0) {
            return timeFrame[0]
        }
        throw new BaseHttpResponse(null, "No time frame available", ERROR_CODE.DEFAULT)

    }

    async getPriorityTimeFrame(cid: string) {
        const cacheKey = RedisKeys.PriorityTimeFrame("1");
        var timeFrame: any[];
        timeFrame = await this.redis.get(cacheKey)
        if (!timeFrame) {
            const proc_name = "PROC_GET_PRIORITY_TIME_FRAME";
            const param = `@ContestId=${cid}`
            var resp = await this.sql.GetDataFromCasualGame(proc_name, "");
            if (!resp) {
                throw new BaseHttpResponse(null, "No time frame available", ERROR_CODE.DEFAULT)
            }
            timeFrame = resp.map(function (obj: any) {
                return {
                    IsUserActive: obj.IsUserActive,
                    IsXFacUserActive: obj.IsXFacUserActive,
                    FirstPriorityId: obj.FirstPriorityId,
                    ToDate: obj.ToDate
                }
            });
            if (resp.length > 0)
                await this.redis.set(cacheKey, timeFrame, parseInt(resp[0].TimeExpire));
        }
        if (timeFrame && timeFrame.length > 0) {
            return timeFrame[0]
        }
        throw new BaseHttpResponse(null, "No time frame available", ERROR_CODE.DEFAULT)

    }

    async getLudoContestHourlyTrend() {
        const cacheKey = RedisKeys.ContestHourlyTrend("1");
        var timeTrend: any = {};
        let cacheResp = await this.redis.get(cacheKey)
        if (!cacheResp) {
            const proc_name = "PROC_GetLudoContestHourlyTrend_V2";
            var resp = await this.sql.GetDataFromCasualGame(proc_name, "");
            if (!resp) {
                throw new BaseHttpResponse(null, "No time trend available", ERROR_CODE.DEFAULT)
            }
            for (let i = 0; i < resp.length; i++) {
                timeTrend[resp[i].ContestId] = {
                    High: resp[i].High,
                    //   Low: 1
                    Low: resp[i].Low
                }
            }
            if (resp.length > 0)
                await this.redis.set(cacheKey, timeTrend, parseInt(resp[0].TimeExpire));
        } else {
            timeTrend = cacheResp
        }
        return timeTrend

    }

    async sendNoOpponentLog(data: ContestRoomData){
        try {
            let playerJoined = await UserService.Instance.getUnactivePlayer(data.contestId, data.timeSlot);
            let userIds = '';
            for(let playerId of playerJoined){
                let playerMid = ContestServer.Instance.playerInfo(playerId)?.mid;
                userIds += `${playerMid},`
            }
            userIds = userIds.slice(0, -1)
            const proc_name = "PROC_LUDO_CREATE_NO_OPPONENT_LOG"
            let param = `@UserId='${userIds}', @ContestId=${data.contestId}`;
            console.log('Calling ', proc_name, param);
            let resp = await this.sql.GetDataFromCasualGame(proc_name, param);
            console.log('NO OPPONENT LOG SP RESULT=>', resp);
        } catch (err) {
            console.log('Error no oppoonent log sp', err);
            throw err
        }
    }
}

export default ContestRoomRepo;