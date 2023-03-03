import { ContestServer } from "app";
import { RedisStorage } from "database/redis";
import { RedisTimeout } from "database/redis/redis.dto";
import { RedisKeys } from "database/redis/redis.keys";
import SqlDB from "database/sql";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { MegaContestData, MegaContestRoomData } from "./megaContest.dto";

class MegaContestRepo {
    private static _instance: MegaContestRepo;
    private redis: RedisStorage
    private sql: SqlDB

    static get Instance() {
        if (!this._instance) {
            this._instance = new MegaContestRepo();
        }
        return this._instance;
    }

    constructor() {
        this.redis = ContestServer.Instance.REDIS
        this.sql = ContestServer.Instance.SQL_DB
    }

    async getContestList(): Promise<MegaContestData[]> {
        const cacheKey = RedisKeys.megaContest();
        let contestList: Array<MegaContestData> = await this.redis.get(cacheKey);
        if(!contestList || contestList?.length <= 0){
            contestList = [];
        }
        for(let contest of contestList){
            contest.contestStart = contest.contestStart * 1000
            contest.GameStartTime = contest.contestStart + contest.WaitingTime
            contest.isTournamentContest = false

            let contestCounters = await this.getPlayerJoinCounter()
            if(contestCounters[parseInt(contest.cid)] != undefined)
                contest.total_joined = contestCounters[parseInt(contest.cid)];
            else
                contest.total_joined = 0;
        }
        return contestList;
    }

    async getContestById(contestId: string): Promise<MegaContestData> {
        let cList = await this.getContestList();
        let contest = cList.find((contest) => contest.cid.toString() == contestId);
        return contest
    }

    async searchRoom(contestId: string, timeSlot: number): Promise<MegaContestRoomData> {
        let data = await this.redis.hgetall(RedisKeys.getMegaContestRoomKey(contestId, timeSlot));
        let resp = null
        if (data && data._id) {
            resp = {
                _id: data._id,
                contestId: data.contestId,
                joinTime: parseInt(data.joinTime), // When player joining starts in contest
                gameStartTime: parseInt(data.gameStartTime), // When game start for players
                state: parseInt(data.state),
                capacity: parseInt(data.capacity),
                gameTimeInMs: parseInt(data.gameTimeInMs),
                noOfRounds: parseInt(data.noOfRounds),
                currentRound: parseInt(data.currentRound),
                nextRoundTime: parseInt(data.nextRoundTime),
                maxUser: parseInt(data.maxUser)
            }
        }
        return resp
    }
    async createRoom(contestRoomData: MegaContestRoomData) {
        return await this.redis.hmset(RedisKeys.getMegaContestRoomKey(contestRoomData.contestId, contestRoomData.gameStartTime), contestRoomData, RedisTimeout.ONE_WEEK);
    }

    async updateContestRoom(contestId: string, gameStartTime: number, data: any) {
        let redisKey = RedisKeys.getMegaContestRoomKey(contestId, gameStartTime)
        return await this.redis.hmset(redisKey, data);
    }

    async existInContestRoom(contestId: string, gameStartTime: number, userId: string) {
        let redisKey = RedisKeys.getMegaContestRoomJoineduser(contestId, gameStartTime)
        let resp = await this.redis.sismember(redisKey, userId);
        return resp;
    }

    async addInContestRoom(contestId: string, gameStartTime: number, userId: string) {
        let redisKey = RedisKeys.getMegaContestRoomJoineduser(contestId, gameStartTime)
        let resp = await this.redis.sadd(redisKey, userId);
        return resp;
    }

    async getPlayerJoined(contestId: string, gameStartTime: number) {
        let joinedPlayerKey = RedisKeys.getMegaContestRoomJoineduser(contestId, gameStartTime)
        let players = this.redis.smembers(joinedPlayerKey);
        return players

    }

    async addContestTickets(contestId: string, gameStartTime: number, data: string[], round: number) {
        let redisKey = RedisKeys.getMegaContestTicketQueue(contestId, gameStartTime, round)
        return await this.redis.rpush(redisKey, data);
    }

    async addUserSpecificTickets(contestId: string, gameStartTime: number, data: any, round: number) {
        let redisKey = RedisKeys.getMegaUserSpecificTicketQueue(contestId, gameStartTime, round)
        return await this.redis.hmset(redisKey, data);
    }

    async popGameTicket(contestId: string, timeSlot: number, round: number = 1) {
        let redisKey = RedisKeys.getMegaContestTicketQueue(contestId, timeSlot, round)
        return await this.redis.rpop(redisKey)
    }

    async fetchUserSpecificGameTicket(contestId: string, timeSlot: number, userId: string, round: number = 1) {
        let redisKey = RedisKeys.getMegaUserSpecificTicketQueue(contestId, timeSlot, round);
        let resp = await this.redis.hget(redisKey, userId)
        console.log('Presence TICKET', resp);
        return resp
    }

    async getRoundWinners(round: number, contestId: string, gameStartTime: number){
        let redisKey = RedisKeys.roundWinners(round, contestId, gameStartTime);
        let winners = await this.redis.smembers(redisKey);
        return winners;
    }

    async getContestPrizeBreakUp(contestId: number) {
        const cacheKey = RedisKeys.MegaContestPrizeBreakUp(contestId.toString());
        const proc_name = "PROC_GET_LUDO_TOURNAMENT_PRIZE_BREAKUP";
        const param = "@ContestId=" + contestId;
        var prizeBreakUp: any[];
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

    async getPlayerJoinCounter() {
        let redisKey = RedisKeys.megaContestRoomCounter();
        return await this.redis.hgetall(redisKey);
    }

    async incJoinPlayerCounter(contestId: string, inc: number) {
        let redisKey = RedisKeys.megaContestRoomCounter();
        return await this.redis.hincrby(redisKey, contestId, inc)
    }

}

export default MegaContestRepo