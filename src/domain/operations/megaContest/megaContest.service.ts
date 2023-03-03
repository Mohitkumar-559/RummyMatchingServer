import { StorageBrowserPolicyFactory } from "@azure/storage-blob";
import { ContestServer } from "app";
import { RedisStorage } from "database/redis";
import { ContestRoomEvent, GamePriority } from "domain/entities/contestRoom/contestRoom.dto";
import { MegaContestData, MegaContestEvent, MegaContestRoomData, MegaContestRoomState, MegaGameTicketData } from "domain/entities/megaContest/megaContest.dto";
import MegaContestRepo from "domain/entities/megaContest/megaContest.repo";
import { IUser, RunningContestData } from "domain/entities/users/user.dto";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { Log } from "middleware/logger";
import Mongoose from "mongoose"
import { Socket } from "socket.io";
import { GAMESERVER_TIMEOUT } from "../contestRoom/contestRoom.service";
import { TransactionService } from "../transactions/transaction.service";
import UserService from "../user/user.service";

const NEXT_ROUND_BUFFER_TIME = 30000
class MegaContestService {
    private static _instance: MegaContestService;
    private repo: MegaContestRepo;
    private redis: RedisStorage;

    static get Instance() {
        if (!this._instance) {
            this._instance = new MegaContestService();
        }
        return this._instance;
    }

    constructor() {
        this.repo = MegaContestRepo.Instance;
        this.redis = ContestServer.Instance.REDIS
    }

    async getContestList(userMid: number) {
        return {
            match_contests: await this.repo.getContestList()
        }
    }

    async subToContest(contestId: string, user: IUser) {
        try {
            let contestData = await this.repo.getContestById(contestId);
            let currentTime = Date.now();

            // Validations
            if (!contestData || currentTime < contestData.contestStart) {
                return new BaseHttpResponse(null, 'Contest not available', ERROR_CODE.DEFAULT)
            } else if (await this.repo.existInContestRoom(contestData.cid, contestData.GameStartTime, user.did)) {
                return new BaseHttpResponse(null, 'User already joined this contest', ERROR_CODE.DEFAULT)
            }

            // Search or create room
            let contestRoom = <MegaContestRoomData>await this.repo.searchRoom(contestId, contestData.GameStartTime);
            if (!contestRoom) {
                contestRoom = await this.createContestRoom(contestData);
            }
            if (contestRoom.state != MegaContestRoomState.ACCEPT_JOINING) {
                return new BaseHttpResponse(null, 'Invalid room state', ERROR_CODE.DEFAULT)
            }
            this.log(contestRoom.contestId, contestRoom.gameStartTime, `User come to subscribe tournament=>${user.name}`, user)

            // Deduct balance
            let isBalanceDeducted = await TransactionService.Instance.deductBalanceForMegaContest(user, contestData);
            if (!isBalanceDeducted) {
                return new BaseHttpResponse(null, 'Failed to deduct money for contest', ERROR_CODE.DEFAULT)
            }
            // Add user in joinedUser
            let joinResponse = await this.repo.addInContestRoom(contestId, contestRoom.gameStartTime, user.did)
            console.log('Is user joined - ', joinResponse);
            if (!joinResponse) {
                return new BaseHttpResponse(contestRoom, 'User failed to join in this contest', ERROR_CODE.OK)
            }

            // Increase contest counter
            let resp = await this.repo.incJoinPlayerCounter(contestRoom.contestId, 1);
            this.log(contestRoom.contestId, contestRoom.gameStartTime, `Increase counter for this room ${resp}`)

            this.log(contestRoom.contestId, contestRoom.gameStartTime, `Subscribe resp =>${user.name}`, contestRoom)
            let subResp: any = contestRoom;
            subResp.serverIp = await this.getAvailableServer()
            subResp.contestId = subResp.contestId.toString();
            return new BaseHttpResponse(subResp, null, ERROR_CODE.OK)
        } catch (err) {
            console.log(err);
            return err
        }
    }

    async createContestRoom(contestData: MegaContestData): Promise<MegaContestRoomData> {
        let currentTime = Date.now()
        let contestRoomData: MegaContestRoomData = {
            _id: new Mongoose.Types.ObjectId().toString(),
            contestId: contestData.cid,
            gameStartTime: contestData.GameStartTime,
            joinTime: contestData.contestStart,
            state: MegaContestRoomState.ACCEPT_JOINING,
            capacity: contestData.tt,
            noOfRounds: contestData.NoOfRound,
            gameTimeInMs: contestData.Duration * 1000,
            currentRound: 1,
            nextRoundTime: contestData.GameStartTime + NEXT_ROUND_BUFFER_TIME,
            maxUser: contestData.MaxUsers

        }
        const resp = await this.repo.createRoom(contestRoomData)
        let timeLeftToStart = contestData.GameStartTime - currentTime;
        if (timeLeftToStart <= 0) {
            throw new BaseHttpResponse(null, 'Time over', ERROR_CODE.DEFAULT)
        }

        // Set timeout for prestart contest config
        console.log(timeLeftToStart, 'Contest start time')
        this.log(contestData.cid, contestData.GameStartTime, `Contest set timeout for preStartconfig in ${timeLeftToStart} sec`)
        setTimeout(this.preStartContestConfig.bind(this, contestRoomData), timeLeftToStart)
        // ContestServer.Instance.BeeQue.setTimer({
        //     functionName: 'preStartContestConfig',
        //     data: contestRoomData,
        //     timeout: contestStartIn
        // })
        return contestRoomData
    }

    async preStartContestConfig(room: MegaContestRoomData) {
        let gameTickets: string[] = [];
        const userService = UserService.Instance;
        const contest: MegaContestData = await this.repo.getContestById(room.contestId);

        console.log('Starting prestate contest function', room);
        let resp = await this.repo.updateContestRoom(room.contestId, room.gameStartTime, { state: MegaContestRoomState.PRESTARTING_CONFIG })
        console.log('Updated state of contest room', resp);

        // If players are less than to complete 1 game
        const totalPlayerJoined = await this.repo.getPlayerJoined(room.contestId, room.gameStartTime);

        const fillPercent = totalPlayerJoined.length / room.maxUser * 100;
        this.log(room.contestId, room.gameStartTime, 'Fill percent=>', fillPercent, totalPlayerJoined)
        if (fillPercent < 50) {
            let resp = await this.repo.updateContestRoom(room.contestId, room.gameStartTime, { state: MegaContestRoomState.CANCELLED })
            this.log(room.contestId, room.gameStartTime, `Room is canceld due to low joining`, resp, fillPercent, totalPlayerJoined);
            return false;
        }

        let remainingSlot = room.maxUser - totalPlayerJoined.length;
        if (remainingSlot > 0) {
            await this.generateGameTickets(GamePriority.XFAC_FIRST, totalPlayerJoined.slice(0, remainingSlot), room, contest)
        } else {
            remainingSlot = 0
        }
        await this.generateGameTickets(GamePriority.XFAC_OFF, totalPlayerJoined.slice(remainingSlot), room, contest)
        // Generate random gameIds
        console.log('Total players in this contest are', totalPlayerJoined);

        // Send event to tell all users to send their presence
        this.log(room.contestId, room.gameStartTime, `Send presence event to everyone`);
        // await userService.emitInRoom(room._id, ContestRoomEvent.PRESENCE, {
        //     contestId: room.contestId,
        //     timeSlot: room.gameStartTime
        // });

        // Set timeout for gameStartConfig
        // this.setTimer(data);
        await this.repo.updateContestRoom(room.contestId, room.gameStartTime, { state: MegaContestRoomState.GAME_START })
        setTimeout(this.startNextRound.bind(this, 1, room, contest), contest.Duration * 1000 + NEXT_ROUND_BUFFER_TIME);

    }
    
    private async generateGameTickets(gameConfig: GamePriority, playerJoined: string[], data: MegaContestRoomData, contest: MegaContestData, round: number = 1): Promise<string[]> {
        // let commonTickets: string[] = [];
        let currentTime = Date.now()
        let userSpecificTicket: any = {}
        let totalPlayerJoined = playerJoined.length;
        const userService = UserService.Instance;
        if (gameConfig == GamePriority.XFAC_FIRST) {
            for (let i = 0; i < playerJoined.length;) {
                let gameId = new Mongoose.Types.ObjectId().toString();

                console.log('Getting xfac for user ==============>', playerJoined[i])
                let xfacData = await UserService.Instance.getXfacData(playerJoined[i], contest, data.gameStartTime);
                Log('xfacLog', 'Getting xfac for ', playerJoined[i], xfacData);
                // If unable to find xfac id then match with normal player.
                if (!xfacData.userId) {
                    for (let j = 0; j < data.capacity; j++) {
                        let ticket: MegaGameTicketData = {
                            gameId: gameId,
                            capacity: data.capacity,
                            serverIp: await this.getAvailableServer(),
                            playerPos: j,
                            contestId: data.contestId,
                            timeSlot: data.gameStartTime,
                            gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                            gamePlayTime: contest.Duration * 1000,
                            round: round,
                            metaData: {
                                gameConfig: gameConfig,
                                isMegaContest: true,
                                nextRoundIn: currentTime + contest.Duration * 1000 + 30000
                            }
                        }
                        userSpecificTicket[playerJoined[i]] = JSON.stringify(ticket)
                        let gameServerResp = await userService.joinGame(playerJoined[i], ticket);
                        i++
                    }
                } else {
                    let ticket: MegaGameTicketData = {
                        gameId: gameId,
                        capacity: data.capacity,
                        serverIp: await this.getAvailableServer(),
                        playerPos: 0,
                        contestId: data.contestId,
                        timeSlot: data.gameStartTime,
                        gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                        gamePlayTime: contest.Duration * 1000,
                        round: round,
                        metaData: {
                            gameConfig: gameConfig,
                            xFacId: xfacData.userId,
                            xFacLevel: xfacData.xFacLevel,
                            xFacMid: xfacData.userMid,
                            xFacLogId: xfacData.xFacLogId,
                            isMegaContest: true,
                            nextRoundIn: currentTime + contest.Duration * 1000 + 30000
                        }
                    }
                    userSpecificTicket[playerJoined[i]] = JSON.stringify(ticket)
                    let gameServerResp = await userService.joinGame(playerJoined[i], ticket);
                    i++
                }
            }
        } else {
            for (let i = 0; i < totalPlayerJoined;) {
                // let isTicketAdded = false;
                let gameId = new Mongoose.Types.ObjectId().toString();

                for (let j = 0; j < data.capacity; j++) {
                    let ticket: MegaGameTicketData = {
                        gameId: gameId,
                        capacity: data.capacity,
                        serverIp: await this.getAvailableServer(),
                        playerPos: j,
                        contestId: data.contestId,
                        timeSlot: data.gameStartTime,
                        gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                        gamePlayTime: contest.Duration * 1000,
                        round: round,
                        metaData: {
                            gameConfig: gameConfig,
                            isMegaContest: true,
                            nextRoundIn: currentTime + contest.Duration * 1000 + 30000
                        }
                    }
                    // commonTickets.push(JSON.stringify(ticket))
                    userSpecificTicket[playerJoined[i]] = JSON.stringify(ticket)
                    let gameServerResp = await userService.joinGame(playerJoined[i], ticket);
                    i++
                }

            }
        }
        // if (commonTickets.length > 0) {
        //     let ticketResp = await this.repo.addContestTickets(data.contestId, data.gameStartTime, commonTickets, round);
        //     console.log('Gameuser tickets added in redis', ticketResp, commonTickets.length, commonTickets)
        // }

        if (Object.keys(userSpecificTicket).length > 0) {
            let resp = await this.repo.addUserSpecificTickets(data.contestId, data.gameStartTime, userSpecificTicket, round);
            console.log('Game tickets added in redis', resp, userSpecificTicket.length)
        }
        return userSpecificTicket;
    }

    async markPresence(contestId: string, gameStartTime: number, user: IUser, socket: Socket, body: any) {
        let contestRoom: MegaContestRoomData;
        try {
            const userService = UserService.Instance;
            contestRoom = await this.repo.searchRoom(contestId, gameStartTime);
            if (!contestRoom) {
                throw new BaseHttpResponse(null, 'No Tournament Found', ERROR_CODE.DEFAULT)
            }
            this.log(contestRoom.contestId, contestRoom.gameStartTime, `User presence come=>${user.name}`, contestRoom, body)

            // Check if user already marked their presence
            let alreadyMarkedPresence = await userService.checkAlreadyInActiveUser(contestId, gameStartTime, user._id)
            if (alreadyMarkedPresence) {
                const resp: RunningContestData = await userService.getRunningContest(user._id);
                this.log(contestRoom.contestId, contestRoom.gameStartTime, `EXISTING SUBSCRITION of ${user.name}`, resp);
                return new BaseHttpResponse(resp.ticketData, 'Presence already marked', ERROR_CODE.OK)
            }

            // Check contestRoom is in accept presence state
            if (contestRoom.state == MegaContestRoomState.ACCEPT_JOINING) {
                throw new BaseHttpResponse(null, 'Early Tournament Presence', ERROR_CODE.DEFAULT)
            } else if (contestRoom.state == MegaContestRoomState.CANCELLED) {
                throw new BaseHttpResponse(null, 'Tournament Cancelled', ERROR_CODE.DEFAULT)
            }
            // Get a agame ticket for a user
            let gameTicket = await this.getUserSpecificTicket(contestId, gameStartTime, user.did);
            this.log(contestRoom.contestId, contestRoom.gameStartTime, `Get game ticket from user speicific queue ${user.name}`, gameTicket);
            if (!gameTicket) {
                gameTicket = await this.getGameTicket(contestId, gameStartTime);
                this.log(contestRoom.contestId, contestRoom.gameStartTime, `Success game ticket for user ${user.name}`, gameTicket);
            }


            // Add user in activeUser list.
            let userAdded = await userService.markActiveUser(contestRoom.contestId, contestRoom.gameStartTime, user._id);
            this.log(contestRoom.contestId, contestRoom.gameStartTime, `User added in active list of ${user.name}`, userAdded)


            // Save state in redis.
            userService.saveAssignedTicket(user._id, gameTicket);
            return new BaseHttpResponse(gameTicket, null, ERROR_CODE.OK)
        } catch (err) {
            console.log(err);
            if (contestRoom) {
                this.log(contestRoom.contestId, contestRoom.gameStartTime, `Error in presence of ${user.name}`, err)
            }
            return err
        }
    }

    async getGameTicket(contestId: string, gameStartTime: number) {
        const ticket = await this.repo.popGameTicket(contestId, gameStartTime);
        if (!ticket) {
            throw new BaseHttpResponse(null, 'Unable to get ticket', ERROR_CODE.DEFAULT)
        }
        return JSON.parse(ticket);

    }

    async getUserSpecificTicket(contestId: string, gameStartTime: number, userId: string) {
        const ticket = await this.repo.fetchUserSpecificGameTicket(contestId, gameStartTime, userId);
        // if (!ticket) {
        //     throw new BaseHttpResponse(null, 'Unable to get ticket', ERROR_CODE.DEFAULT)
        // }
        return ticket ? JSON.parse(ticket) : ticket;

    }

    private async startNextRound(prevRound: number, room: MegaContestRoomData, contest: MegaContestData) {
        this.log(room.contestId, room.gameStartTime, 'Start next round called', prevRound, room)
        let isLastRound = false;
        if (prevRound == room.noOfRounds) {
            isLastRound = true
        }
        if (isLastRound) {
            this.log(room.contestId, room.gameStartTime, 'All rounds complete now declaring result');
            return
        }
        let currentRound = prevRound + 1;
        let currentRoundWinners = await this.repo.getRoundWinners(prevRound, room.contestId, room.gameStartTime);
        this.log(room.contestId, room.gameStartTime, 'Current round winners=>', currentRoundWinners);
        await this.generateGameTickets(GamePriority.XFAC_OFF, currentRoundWinners, room, contest, currentRound);
        
        let nextRoundStartTime = Date.now() + (contest.Duration*1000 + NEXT_ROUND_BUFFER_TIME)
        let resp = await this.repo.updateContestRoom(room.contestId, room.gameStartTime, { currentRound: currentRound, nextRoundTime: nextRoundStartTime })
        setTimeout(this.startNextRound.bind(this, prevRound + 1, room, contest), contest.Duration * 1000 + NEXT_ROUND_BUFFER_TIME);
    }

    async getAvailableServer() {
        return process.env.GAME_SERVER_IP;
    }

    async getContestPrizeBreakUp(cid: number) {
        try {
            let contest: MegaContestData = await this.repo.getContestById(cid.toString());
            let prizeBreakUp: any[] = [];

            if (contest) {
                prizeBreakUp = await this.repo.getContestPrizeBreakUp(cid);
                // if (prizeBreakUp.length > 0)
                //     prizeBreakUp = from(prizeBreakUp).orderBy((x: any) => x.wf).toArray();

            }
            let resp = {
                "contest": contest,
                "breakup": prizeBreakUp
            };
            return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
        }
        catch (e) {
            console.log("Error in prize breakup", e)
            return new BaseHttpResponse("", (e as Error).message, ERROR_CODE.EXCEPTION)
        }
    }

    async sendCounters(prevData: any) {
        console.log('Sending counters');
        let newData = await this.repo.getPlayerJoinCounter();
        try {
            let resp: any = []
            for (let cid in newData) {
                newData[cid] = Number(newData[cid])
            }
            let isCounterChanged = this.getContestThatChanged(prevData, newData)
            Log('cont-test', isCounterChanged, prevData, newData);
            if (isCounterChanged.length > 0) {
                for (let i = 0; i < isCounterChanged.length; i++) {
                    let cid = isCounterChanged[i]
                    let playerCount = newData[cid]
                    resp.push({
                        contestId: cid,
                        playerJoined: playerCount
                    })
                }
                let httpResp = new BaseHttpResponse(resp, null, ERROR_CODE.OK)
                ContestServer.Instance.counterSocketServer.IO.emit(MegaContestEvent.CONTEST_COUTER, httpResp);
            }

            // return newData
        } catch (err) {
            console.error('sendCounter error=>', err);
        }
        setTimeout(this.sendCounters.bind(this, newData), 2000);
        return
    }

    getContestThatChanged(prevData: any, newData: any) {
        let resp: string[] = [];
        if (!prevData || !newData) {
            for (let cid in newData) {
                resp.push(cid)
            }
        } else {
            for (let cid in newData) {
                if (prevData[cid] != newData[cid]) {
                    resp.push(cid);
                }
            }
        }
        return resp
    }

    log(_id: string, gameStartTime: number, ...args: any) {
        let uid = _id + '-' + gameStartTime;
        Log(uid, args);
        return
    }
}

export default MegaContestService;