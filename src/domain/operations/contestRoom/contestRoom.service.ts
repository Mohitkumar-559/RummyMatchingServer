import Mongoose from "mongoose"
import { ContestData, ContestRoomData, ContestRoomEvent, ContestRoomState, GameTicketData, Category, Breakup, RoomType, GamePriority, TimeTrendLevel, GameMode } from "domain/entities/contestRoom/contestRoom.dto";
import ContestRoomRepo from "domain/entities/contestRoom/contestRoom.repo";
import { IUser, RunningContestData } from "domain/entities/users/user.dto";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { Log } from "middleware/logger";
import { Socket } from "socket.io";
import UserService from "../user/user.service";
import { ContestServer } from "app";
import { from } from "linq-to-typescript";
import { throws } from "assert";
import { RedisStorage } from "database/redis";
import { RedisKeys } from "database/redis/redis.keys";
import { DrawMoneyData, JoinContestResponse, TransactionTokenRequest, ContestPrizeBreakUpRequest } from "domain/entities/transactions/transaction.dto";
import { TransactionService } from "../transactions/transaction.service";
import _, { delay } from 'lodash';
import { getGameConfig } from "domain/utils/game";
import MegaContestRepo from "domain/entities/megaContest/megaContest.repo";

const MATCHMAKING_WAIT_TIME = 30000 // Maximum waiting time for player to start game 
const MAX_MATCHMAKING_SLOT = 5      // Max time server matchMake with unactive player before closing the contest.
export const GAMESERVER_TIMEOUT = MATCHMAKING_WAIT_TIME + 15000; // Wait time on gamerserver after that user exit from game.
class ContestRoomService {
    private static _instance: ContestRoomService;
    private static contestDelta: any;
    private repo: ContestRoomRepo;
    private redis: RedisStorage;

    recacheCategory: Array<Category> = [];

    static get Instance() {
        if (!this._instance) {
            this._instance = new ContestRoomService();
        }
        return this._instance;
    }

    constructor() {
        this.repo = ContestRoomRepo.Instance;
        this.redis = ContestServer.Instance.REDIS
    }

    convertToDate(epoch: number) {
        return new Date(epoch).toLocaleString();
    }

    async subToContest(contestId: string, user: IUser, socket: Socket) {
        try {
            let timeSlot: number;
            let startTime: number;
            let constestData = await this.repo.getContestById(contestId);
            const userService = UserService.Instance
            let contestRoom: ContestRoomData;

            let currentTime = Date.now();
            let delayInStart = (currentTime - constestData.StartTime) % (constestData.WaitingTime + constestData.DelayTime)
            timeSlot = currentTime - delayInStart;// Joining start of a contest room
            startTime = timeSlot + constestData.WaitingTime // Join stop of this contest OR game start
            console.log('START TIME OF DB ', constestData.StartTime, constestData.WaitingTime, constestData.DelayTime);
            console.log('DELAY IN START =>', delayInStart);
            console.log('CURRENT START TIME IS =>', this.convertToDate(timeSlot), timeSlot)
            console.log('CONTEST END TIME=>', this.convertToDate(startTime), startTime)
            console.log('USER TIME IS=>', this.convertToDate(currentTime))

            // Validationsq
            // Check user send valid time slot for joining
            if (currentTime < timeSlot || currentTime > startTime) {
                return new BaseHttpResponse(null, 'Invalid time slot', ERROR_CODE.DEFAULT)
            } else if(!constestData.IsStart){
                return new BaseHttpResponse(null, 'Contest is not started yet', ERROR_CODE.DEFAULT)
            }

            // Search or create room
            contestRoom = <ContestRoomData>await this.repo.searchRoom(contestId, timeSlot);
            if (!contestRoom) {
                contestRoom = await this.createContestRoom(constestData, timeSlot);
            }
            if (contestRoom.state != ContestRoomState.ACCEPT_JOINING) {
                return new BaseHttpResponse(null, 'Invalid room state', ERROR_CODE.DEFAULT)
            }
            this.log(contestRoom.contestId, contestRoom.timeSlot, `User come to subscribe=>${user.name}`)

            // Add user in joinedUser
            let joinResponse = await this.joinContestRoom(contestRoom, user);

            // Join user in socket room
            this.log(contestRoom.contestId, timeSlot, 'Sending joining function for ', socket.data);
            userService.joinSocketRoom(contestRoom._id, socket);

            contestRoom.timeRemaining = contestRoom.startTime - currentTime

            if (!joinResponse) {
                return new BaseHttpResponse(contestRoom, 'User already joined in this contest', ERROR_CODE.OK)
            }

            // Increase contest counter
            let resp = await this.repo.incJoinPlayerCounter(contestRoom.contestId, 1);
            this.log(contestRoom.contestId, contestRoom.timeSlot, `Increase counter for this room ${resp}`)
            // Save state in redis.
            userService.addRunningContest(user._id, contestId, timeSlot);

            this.log(contestRoom.contestId, contestRoom.timeSlot, `Subscribe resp =>${user.name}`, contestRoom)
            let subResp: any = contestRoom;
            subResp.serverIp = await this.getAvailableServer()
            return new BaseHttpResponse(subResp, null, ERROR_CODE.OK)
        } catch (err) {
            console.log(err);
            return err
        }
    }

    async createContestRoom(contestData: ContestData, timeSlot: number): Promise<ContestRoomData> {
        let currentTime = Date.now()
        let contestRoomData: ContestRoomData = {
            _id: new Mongoose.Types.ObjectId().toString(),
            contestId: contestData.cid,
            timeSlot: timeSlot,
            startTime: timeSlot + contestData.WaitingTime,
            state: ContestRoomState.ACCEPT_JOINING,
            capacity: contestData.tt,
            matchMakingFunctionRun: 0
        }
        const resp = await this.repo.createRoom(contestRoomData)
        let delayStartTime = currentTime - timeSlot
        let contestStartIn = contestData.WaitingTime - delayStartTime
        if (contestStartIn <= 0) {
            throw new BaseHttpResponse(null, 'Time over', null)
        }

        // Set timeout for prestart contest config
        console.log(contestStartIn, 'Contest start time')
        this.log(contestData.cid, timeSlot, `Contest set timeout for preStartconfig in ${contestStartIn} sec`)
        setTimeout(this.preStartContestConfig.bind(this, contestRoomData), contestStartIn)
        // ContestServer.Instance.BeeQue.setTimer({
        //     functionName: 'preStartContestConfig',
        //     data: contestRoomData,
        //     timeout: contestStartIn
        // })
        return contestRoomData
    }

    async joinContestRoom(data: ContestRoomData, user: IUser) {
        const userService = UserService.Instance
        let alreadyJoined = await userService.checkAlreadyJoinedContest(data.contestId, data.timeSlot, user._id)
        if (alreadyJoined) {
            return false
        }
        let canJoin = await userService.canJoinContest(data.contestId, user.mid)
        if (!canJoin) {
            return false
        }

        let isJoined = await userService.joinContest(data.contestId, data.timeSlot, user._id)
        console.log('Is user joined - ', isJoined);

        return isJoined
    }

    async preStartContestConfig(data: ContestRoomData) {
        let gameTickets: string[] = [];
        const userService = UserService.Instance;
        const contest: ContestData = await this.repo.getContestById(data.contestId);

        console.log('Starting prestate contest function', data);
        let resp = await this.repo.updateContestRoom(data.contestId, data.timeSlot, { state: ContestRoomState.PRESENCE_ACCEPTING })
        console.log('Updated state of contest room', resp);

        // If players are less than to complete 1 game
        const totalPlayerJoined = await this.repo.getTotalPlayerCount(data.contestId, data.timeSlot);
        // Decrease counter for contest
        let respCounter = await this.repo.resetJoinPlayerCounter(data.contestId);
        this.log(data.contestId, data.timeSlot, `Decrease counter for this room ${respCounter}`, contest)
        let gameConfig = await getGameConfig(contest);
        if (contest.tt == 4) {
            gameConfig = GamePriority.XFAC_OFF;
        }

        // if (gameConfig == GamePriority.XFAC_OFF && totalPlayerJoined < data.capacity) {
        //     this.log(data.contestId, data.timeSlot, `Send noOpponentFound event to everyone`);
        //     this.repo.sendNoOpponentLog(data)
        //     await userService.emitInRoom(data._id, ContestRoomEvent.NO_OPPONENT_FOUND, {
        //         contestId: data.contestId,
        //         timeSlot: data.timeSlot
        //     });
        //     await this.closeContest(data);
        //     return
        // }

        // Generate random gameIds
        console.log('Total players in this contest are', totalPlayerJoined);
        gameTickets = await this.generateGameTickets(gameConfig, totalPlayerJoined, data, contest);

        // Send event to tell all users to send their presence
        this.log(data.contestId, data.timeSlot, `Send presence event to everyone`);
        await userService.emitInRoom(data._id, ContestRoomEvent.PRESENCE, {
            contestId: data.contestId,
            timeSlot: data.timeSlot
        });

        // Set timeout for gameStartConfig
        // this.setTimer(data);
        setTimeout(this.closeContest.bind(this, data), MATCHMAKING_WAIT_TIME)

    }

    private async generateGameTickets(gameConfig: GamePriority, totalPlayerJoined: number, data: ContestRoomData, contest: ContestData): Promise<string[]> {
        let commonTickets: string[] = [];
        let userSpecificTicket: any = {}
        let playerJoined = await UserService.Instance.getUnactivePlayer(data.contestId, data.timeSlot);
        if (gameConfig == GamePriority.XFAC_FIRST) {
            for (let i = 0; i < playerJoined.length;) {
                let gameId = new Mongoose.Types.ObjectId().toString();

                console.log('Getting xfac for user ==============>', playerJoined[i])
                let xfacData = await UserService.Instance.getXfacData(playerJoined[i], contest, data.timeSlot);
                Log('xfacLog', 'Getting xfac for ', playerJoined[i], xfacData);
                // If unable to find xfac id then match with normal player.
                if (!xfacData.userId) {
                    for (let j = 0; j < data.capacity; j++) {
                        let ticket: GameTicketData = {
                            gameId: gameId,
                            capacity: data.capacity,
                            serverIp: await this.getAvailableServer(),
                            playerPos: j,
                            contestId: data.contestId,
                            timeSlot: data.timeSlot,
                            gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                            gamePlayTime: contest.Duration * 1000,
                            isPrivate: false,
                            metaData: {
                                gameConfig: gameConfig
                            }
                        }
                        commonTickets.push(JSON.stringify(ticket))

                    }
                    i++
                } else {
                    let ticket: GameTicketData = {
                        gameId: gameId,
                        capacity: data.capacity,
                        serverIp: await this.getAvailableServer(),
                        playerPos: 0,
                        contestId: data.contestId,
                        timeSlot: data.timeSlot,
                        gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                        gamePlayTime: contest.Duration * 1000,
                        isPrivate: false,
                        metaData: {
                            gameConfig: gameConfig,
                            xFacId: xfacData.userId,
                            xFacLevel: xfacData.xFacLevel,
                            xFacMid: xfacData.userMid,
                            xFacLogId: xfacData.xFacLogId
                        }
                    }
                    userSpecificTicket[playerJoined[i]] = JSON.stringify(ticket)
                    i++
                }
            }
        } else {
            for (let i = 0; i < totalPlayerJoined;) {
                let isTicketAdded = false;
                let gameId = new Mongoose.Types.ObjectId().toString();
                if (await UserService.Instance.isPresetUser(playerJoined[i], data.contestId)) {
                    this.log(data.contestId, parseInt(data.contestId), 'User found in preset user', playerJoined[i])
                    // call xfac
                    let xfacData = await UserService.Instance.getXfacData(playerJoined[i], contest, data.timeSlot);
                    if (xfacData.userId) {
                        let ticket: GameTicketData = {
                            gameId: gameId,
                            capacity: data.capacity,
                            serverIp: await this.getAvailableServer(),
                            playerPos: 0,
                            contestId: data.contestId,
                            timeSlot: data.timeSlot,
                            gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                            gamePlayTime: contest.Duration * 1000,
                            isPrivate: false,
                            metaData: {
                                gameConfig: GamePriority.XFAC_FIRST,
                                xFacId: xfacData.userId,
                                xFacLevel: xfacData.xFacLevel,
                                xFacMid: xfacData.userMid,
                                xFacLogId: xfacData.xFacLogId
                            }
                        }
                        userSpecificTicket[playerJoined[i]] = JSON.stringify(ticket)
                        i++
                        isTicketAdded = true
                    }
                }
                if (!isTicketAdded) {
                    for (let j = 0; j < data.capacity; j++) {
                        let ticket: GameTicketData = {
                            gameId: gameId,
                            capacity: data.capacity,
                            serverIp: await this.getAvailableServer(),
                            playerPos: j,
                            contestId: data.contestId,
                            timeSlot: data.timeSlot,
                            gameServerTimeoutIn: GAMESERVER_TIMEOUT,
                            gamePlayTime: contest.Duration * 1000,
                            isPrivate: false,
                            metaData: {
                                gameConfig: gameConfig
                            }
                        }
                        commonTickets.push(JSON.stringify(ticket))
                    }
                    i++
                }
            }
        }
        if (commonTickets.length > 0) {
            let ticketResp = await this.repo.addContestTickets(data.contestId, data.timeSlot, commonTickets);
            console.log('Gameuser tickets added in redis', ticketResp, commonTickets.length, commonTickets)
        }

        if (Object.keys(userSpecificTicket).length > 0) {
            let resp = await this.repo.addUserSpecificTickets(data.contestId, data.timeSlot, userSpecificTicket);
            console.log('Game tickets added in redis', resp, commonTickets.length)
        }
        return commonTickets;
    }

    async markPresence(contestId: string, timeSlot: number, user: IUser, socket: Socket, body: any) {
        let contestRoom: ContestRoomData;
        try {
            const userService = UserService.Instance;
            contestRoom = await this.repo.searchRoom(contestId, timeSlot);
            if (!contestRoom) {
                throw new BaseHttpResponse(null, 'No Contest Found', ERROR_CODE.DEFAULT)
            }
            this.log(contestRoom.contestId, contestRoom.timeSlot, `User presence come=>${user.name}`, contestRoom, body)

            // Check if user already marked their presence
            let alreadyMarkedPresence = await userService.checkAlreadyInActiveUser(contestId, timeSlot, user._id)
            if (alreadyMarkedPresence) {
                const resp: RunningContestData = await userService.getRunningContest(user._id);
                this.log(contestRoom.contestId, contestRoom.timeSlot, `EXISTING SUBSCRITION of ${user.name}`, resp);
                return new BaseHttpResponse(resp.ticketData, 'Presence already marked', ERROR_CODE.OK)
            }

            // Check contestRoom is in accept presence state
            if (contestRoom.state != ContestRoomState.PRESENCE_ACCEPTING) {
                if (contestRoom.state == ContestRoomState.ACCEPT_JOINING && Date.now() <= contestRoom.startTime) {
                    throw new BaseHttpResponse(null, 'Early presence', ERROR_CODE.EARLY_PRESENCE)
                }
                throw new BaseHttpResponse(null, 'Time over for presence', ERROR_CODE.DEFAULT)
            }
            // Get a agame ticket for a user
            let gameTicket = await this.getUserSpecificTicket(contestId, timeSlot, user.did);
            this.log(contestRoom.contestId, contestRoom.timeSlot, `Get game ticket from user speicific queue ${user.name}`, gameTicket);
            if (!gameTicket) {
                gameTicket = await this.getGameTicket(contestId, timeSlot);
                this.log(contestRoom.contestId, contestRoom.timeSlot, `Success game ticket for user ${user.name}`, gameTicket);
            }


            // Add user in activeUser list.
            let userAdded = await userService.markActiveUser(contestRoom.contestId, contestRoom.timeSlot, user._id);
            this.log(contestRoom.contestId, contestRoom.timeSlot, `User added in active list of ${user.name}`, userAdded)

            // Hit hook on game server (userId, gameId, contestId) to join user game.
            console.log('Sending Start Game hook for player', user.name);
            let gameServerResp = await userService.joinGame(user._id, gameTicket);

            this.log(contestRoom.contestId, contestRoom.timeSlot, `User game join resp from server =>${user.name}`, gameServerResp)

            // Save state in redis.
            userService.saveAssignedTicket(user._id, gameTicket);
            return new BaseHttpResponse(gameTicket, null, ERROR_CODE.OK)
        } catch (err) {
            console.log(err);
            if (contestRoom) {
                this.log(contestRoom.contestId, contestRoom.timeSlot, `Error in presence of ${user.name}`, err)
            }
            return err
        }
    }

    async getGameTicket(contestId: string, timeSlot: number) {
        const ticket = await this.repo.popGameTicket(contestId, timeSlot);
        if (!ticket) {
            throw new BaseHttpResponse(null, 'Unable to get ticket', ERROR_CODE.DEFAULT)
        }
        return JSON.parse(ticket);

    }

    async getUserSpecificTicket(contestId: string, timeSlot: number, userId: string) {
        const ticket = await this.repo.fetchUserSpecificGameTicket(contestId, timeSlot, userId);
        // if (!ticket) {
        //     throw new BaseHttpResponse(null, 'Unable to get ticket', ERROR_CODE.DEFAULT)
        // }
        return ticket ? JSON.parse(ticket) : ticket;

    }

    async matchMakingActivePlayers(data: ContestRoomData) {
        try {
            //Increase contestRoom count every time this function run
            await this.repo.incFunctionCount(data.contestId, data.timeSlot, 'matchMakingFunctionRun');


            const userService = UserService.Instance;
            let ticket: GameTicketData = await this.getGameTicket(data.contestId, data.timeSlot)
            let unactivePlayers = await userService.getUnactivePlayer(data.contestId, data.timeSlot);

            this.log(data.contestId, data.timeSlot, `matchMakingActivePlayer called`)
            console.log('matchMaking called');
            // If there is no active game with less number of player
            if (ticket.playerPos == data.capacity - 1) {
                this.log(data.contestId, data.timeSlot, 'No active partial game found')
                console.log('There is not active partial games.')
                this.setTimer(data);
                return
            }

            // If there is no unactive player then close contest, remaining active players if any get there waiting timeout and exist the game
            if (unactivePlayers.length <= 0) {
                this.log(data.contestId, data.timeSlot, 'call closeContest on matchMakingctivePlayer')
                console.log('call closeContest no unactive player found')
                this.closeContest(data);
                return
            }

            let partialTickets = [ticket]
            for (let i = 0; i < ticket.playerPos; i++) {
                partialTickets.push(await this.getGameTicket(data.contestId, data.timeSlot))
            }
            for (let i = 0; i < partialTickets.length; i++) {
                await this.matchMakeUnactivePlayer(unactivePlayers.pop(), partialTickets.pop(), data);
            }

            this.setTimer(data);
            return;
        } catch (err) {
            console.log('Error in matchMakingActivePlayer closingContest', err);
            this.closeContest(data);

        }

    }

    async matchMakeUnactivePlayer(playerId: string, ticket: GameTicketData, data: ContestRoomData) {
        const userService = UserService.Instance;
        if (!playerId) {
            return false
        }
        // Add user in activeUser list.
        let userAdded = await userService.markActiveUser(ticket.contestId, ticket.timeSlot, playerId);
        this.log(data.contestId, data.timeSlot, `${playerId} added in active list in matchMakingUnactivePlayer`)
        console.log('User added in active list', userAdded)

        // Hit hook on game server (userId, gameId, contestId) to join user game.
        let resp = await userService.joinGame(playerId, ticket);
        this.log(data.contestId, data.timeSlot, 'User join resp from matchMakingUnactivePlayer', resp)
        userService.saveAssignedTicket(playerId, ticket);
        return true
    }

    async getAvailableServer() {
        return process.env.GAME_SERVER_IP;
    }

    async setTimer(data: ContestRoomData) {
        let contestRoom: ContestRoomData = await this.repo.searchRoom(data.contestId, data.timeSlot);
        if (!contestRoom) {
            this.closeContest(data);
        }
        console.log('settimer function called', contestRoom.matchMakingFunctionRun);
        if (contestRoom.matchMakingFunctionRun <= MAX_MATCHMAKING_SLOT) {
            setTimeout(this.matchMakingActivePlayers.bind(this, data), MATCHMAKING_WAIT_TIME);
            // ContestServer.Instance.BeeQue.setTimer({
            //     functionName: 'matchMakingActivePlayers',
            //     data: data,
            //     timeout: MATCHMAKING_WAIT_TIME
            // })
        } else {
            this.closeContest(data);
        }

    }

    async closeContest(room: ContestRoomData) {
        const userService = UserService.Instance;
        let resp = await this.repo.updateContestRoom(room.contestId, room.timeSlot, { state: ContestRoomState.GAME_START })
        this.log(room.contestId, room.timeSlot, 'Updated state of contest room at closeContest', resp);
        let unactivePlayers = await userService.getUnactivePlayer(room.contestId, room.timeSlot);
        let totalUnactivePlayerDrawMoney = 0;

        if (unactivePlayers.length < room.capacity - 1) {
            this.log(room.contestId, room.timeSlot, 'Remaining player is not sufficient for draw money', unactivePlayers);
        } else {
            let gamePlayers = []
            let playerAdded = 0;
            for (let i = 0; i < unactivePlayers.length; i++) {
                gamePlayers.push(unactivePlayers[i])
                playerAdded++;
                if (playerAdded == room.capacity) {
                    await this.drawMoney(gamePlayers, room);
                    gamePlayers = [];
                    totalUnactivePlayerDrawMoney += playerAdded
                    playerAdded = 0
                }
            }
        }
        let totalPlayerInContest = await this.repo.getTotalPlayerCount(room.contestId, room.timeSlot);
        let totalActivePlayers = await this.repo.getActivePlayerCount(room.contestId, room.timeSlot);
        let logData: any = {
            evName: "onSubscribe",
            cid: room.contestId,
            sc: totalPlayerInContest,
            mmc: totalActivePlayers + totalUnactivePlayerDrawMoney,
            mp: room.capacity,
            st: room.timeSlot
        }
        this.log(room.contestId, room.timeSlot, `Sending log data at closeContest`, logData)
        await ContestServer.Instance.RabbitMQ.pushToLogQueue(logData);
        await this.freeXfacUser(room);
        return

    }
    async freeXfacUser(data: ContestRoomData) {
        let remainingTicket = await this.repo.getUserSpecificTicket(data.contestId, data.timeSlot);
        for (let userId in remainingTicket) {
            let ticket = JSON.parse(remainingTicket[userId]);
            if (ticket.metaData?.xFacMid) {
                Log('xfacLog', 'Freeing xfac ', ticket.metaData.xFacMid);
                UserService.Instance.freeUser(ticket.metaData.xFacMid);
            }

        }
    }

    async drawMoney(unactivePlayers: string[], data: ContestRoomData) {
        const transactionService = TransactionService.Instance;
        const userService = UserService.Instance;
        try {
            this.log(data.contestId, data.timeSlot, `Draw money called for ${unactivePlayers}`)
            // Create room for unactive players;
            var request: TransactionTokenRequest = {
                cid: Number(data.contestId),
                userList: [],
                gameserverid: '',
                gameMode: GameMode.TIME_BASED
            }
            for (let i = 0; i < unactivePlayers.length; i++) {
                let player = await userService.fetchProfile(unactivePlayers[i])
                request.userList.push({
                    UserId: player._id,
                    UserLoginId: player.mid,
                    ReferCode: player.referCode
                })
            }
            const deductBalanceResponse: JoinContestResponse = await transactionService.JoinContest(request, data);

            this.log(data.contestId, data.timeSlot, `Deduct bal response for draw money ${deductBalanceResponse}`);
            let drawMoneyData: DrawMoneyData = {
                RoomId: deductBalanceResponse.RoomId,
                ContestId: data.contestId,
                participantScores: []
            }
            for (let i = 0; i < unactivePlayers.length; i++) {
                let player = await userService.fetchProfile(unactivePlayers[i])
                drawMoneyData.participantScores.push({
                    UserId: player.mid,
                    Score: -5
                })
            }
            this.log(data.contestId, data.timeSlot, `Push data to winning queue fr draw money ${drawMoneyData}`)
            await ContestServer.Instance.RabbitMQ.pushToWinningQueue(drawMoneyData);

        } catch (err) {
            return false
        }
        return true;
    }

    async getContestList(LoggedInUserId: number) {
        try {
            const cacheKey = RedisKeys.ContestDetails("1");
            // const PracticeContestcacheName = RedisKeys.PracticeContestUser(LoggedInUserId.toString());
            const GiveawayContestcacheName = RedisKeys.GiveawayUserContest(LoggedInUserId.toString());
            let contests: ContestData[] = await this.redis.get(cacheKey); //[await this.repo.getContest('1')];
            //console.log(contests);
            let cList: any[] = []
            let contestCounters = await this.repo.getPlayerJoinCounter()
            for (let i = 0; i < contests.length; i++) {
                contests[i]['total_joined'] = contestCounters[contests[i].cid]
                let contest = contests[i];
                if (contest.GameMode == GameMode.TIME_BASED) {
                    cList.push(contest)
                }
            }

            if (LoggedInUserId > 0) {
                let cacheResp = await this.redis.get(GiveawayContestcacheName);
                if (cacheResp) {
                    for (let obj of cacheResp) {
                        cList = await from(cList).where((x: any) => x.catid != obj.catid).toArray();
                    }
                }
            }

            let recacheCategory: Category[] = await this.repo.getContestCategorisationInCache(1);

            let resp = {
                "categorisation": recacheCategory,
                "match_contest": cList,
                "socket_url": process.env.SELF_IP + ContestServer.Instance.counterSocketServer.PATH + '/'
            };
            return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
        }
        catch (e) {
            return new BaseHttpResponse("", (e as Error).message, ERROR_CODE.EXCEPTION);
        }

    }

    async getContestListV2(LoggedInUserId: number, gameMode: number) {
        try {
            const cacheKey = RedisKeys.ContestDetails("1");
            // const PracticeContestcacheName = RedisKeys.PracticeContestUser(LoggedInUserId.toString());
            const GiveawayContestcacheName = RedisKeys.GiveawayUserContest(LoggedInUserId.toString());
            let contests: ContestData[] = await this.redis.get(cacheKey); //[await this.repo.getContest('1')];
            let cList: any[] = []
            let contestCounters = await this.repo.getPlayerJoinCounter()
            for (let i = 0; i < contests.length; i++) {
                contests[i]['total_joined'] = contestCounters[contests[i].cid]
                let contest = contests[i];
                if (gameMode) {
                    if (contest.GameMode == gameMode) {
                        cList.push(contest)
                    }
                } else {
                    cList.push(contest)
                }

            }

            if (LoggedInUserId > 0) {
                let cacheResp = await this.redis.get(GiveawayContestcacheName);
                if (cacheResp) {
                    for (let obj of cacheResp) {
                        cList = await from(cList).where((x: any) => x.catid != obj.catid).toArray();
                    }
                }
            }

            let recacheCategory: Category[] = await this.repo.getContestCategorisationInCache(1);

            let resp = {
                "categorisation": recacheCategory,
                "match_contest": cList,
                "socket_url": process.env.SELF_IP + ContestServer.Instance.counterSocketServer.PATH + '/',
                "bannerRedirectUrl": "https://oneto11.in/playstore/",
                "tournament": gameMode == GameMode.TIME_BASED ? await MegaContestRepo.Instance.getContestList() : []
            };
            return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
        }
        catch (e) {
            return new BaseHttpResponse("", (e as Error).message, ERROR_CODE.EXCEPTION);
        }

    }

    async getFreeContestList(LoggedInUserId: number, gameMode: number) {
        try {
            const cacheKey = RedisKeys.ContestDetails("1");
            // const PracticeContestcacheName = RedisKeys.PracticeContestUser(LoggedInUserId.toString());
            const GiveawayContestcacheName = RedisKeys.GiveawayUserContest(LoggedInUserId.toString());
            let contests: ContestData[] = await this.redis.get(cacheKey); //[await this.repo.getContest('1')];
            let cList: any[] = []
            let contestCounters = await this.repo.getPlayerJoinCounter()
            for (let i = 0; i < contests.length; i++) {
                contests[i]['total_joined'] = contestCounters[contests[i].cid]
                let contest = contests[i];
                if (gameMode && contest.GameMode == gameMode) {
                    cList.push(contest)
                }
            }

            if (LoggedInUserId > 0) {
                let cacheResp = await this.redis.get(GiveawayContestcacheName);
                if (cacheResp) {
                    for (let obj of cacheResp) {
                        cList = await from(cList).where((x: any) => x.catid != obj.catid).toArray();
                    }
                }
            }

            cList = cList.filter((c) => {
                console.log(c)
                return c.catid == 1
            });

            let recacheCategory: Category[] = await this.repo.getContestCategorisationInCache(1);
            recacheCategory = recacheCategory.filter((c) => { return c.catid == 1 });

            let resp = {
                "categorisation": recacheCategory,
                "match_contest": cList,
                "socket_url": process.env.SELF_IP + ContestServer.Instance.counterSocketServer.PATH + '/',
                "bannerRedirectUrl": process.env.BANNER_REDIRECT_URL
            };
            return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
        }
        catch (e) {
            return new BaseHttpResponse("", (e as Error).message, ERROR_CODE.EXCEPTION);
        }

    }

    async getContestById(contestId: number) {
        let contests: ContestData = await this.repo.getContestById(contestId.toString());
        let resp = {
            "match_contest": contests
        };
        return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
    }

    async getContestPrizeBreakUp(request: ContestPrizeBreakUpRequest) {
        try {
            let contests: ContestData = await this.repo.getContestById(request.contestId.toString());
            let prizeBreakUp: Breakup[] = [];

            if (contests) {
                prizeBreakUp = await this.repo.getContestPrizeBreakUp(request.contestId);
                if (prizeBreakUp.length > 0)
                    prizeBreakUp = from(prizeBreakUp).orderBy((x: any) => x.wf).toArray();

            }
            let resp = {
                "contest": contests,
                "breakup": prizeBreakUp
            };
            return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
        }
        catch (e) {
            console.log("Error in prize breakup", e)
            return new BaseHttpResponse("", (e as Error).message, ERROR_CODE.EXCEPTION)
        }
    }

    async checkSubscription(userId: string) {
        const userService = UserService.Instance;
        const userContestData: RunningContestData = await userService.getRunningContest(userId);
        let resp = {}
        console.log('PLAYER SUB CHECK', userContestData);
        if (userContestData) {
            let contestData: ContestData = await this.repo.getContestById(userContestData.contestId);
            let currentTime = Date.now();
            let delayInStart = (currentTime - contestData.StartTime) % (contestData.WaitingTime + contestData.DelayTime)
            let currentTimeSlot = currentTime - delayInStart;// Joining start of a contest room

            if (currentTimeSlot == userContestData.timeSlot) {
                resp = userContestData;
            } else {
                console.log('PLAYER CHECK SUB FAIL', currentTimeSlot, userContestData.timeSlot)
            }
        }
        return new BaseHttpResponse(resp, null, ERROR_CODE.OK);
    }

    async getUserJoinContest(userId: number) {
        try {
            const cacheKey = RedisKeys.ContestDetails("1");
            let contests: ContestData[] = await this.redis.get(cacheKey);
            let cList: any[] = []
            let currentTime = Date.now()
            let contestCounters = await this.repo.getPlayerJoinCounter()
            if (contests) {
                for (let i = 0; i < contests.length; i++) {
                    let contest = contests[i];
                    cList.push(contest)
                    let startTime = contest.StartTime;
                    //let delayFromStart = (currentTime-startTime)%contest.contestStartInEveryMs;
                    //cList[i]['timeSlot'] = currentTime - delayFromStart;
                    cList[i]['total_joined'] = contestCounters[contest.cid]
                    //cList[i]['gameStartIn'] =  contest.contestStartInEveryMs - delayFromStart;
                }

                let resp = {
                    "match_contest": contests
                };
                return new BaseHttpResponse(resp, null, ERROR_CODE.OK);
            }
            else {
                return new BaseHttpResponse(null, null, ERROR_CODE.CONTESTNOTFOUND);
            }
        }
        catch (e) {
            return new BaseHttpResponse("", (e as Error).message, ERROR_CODE.EXCEPTION);
        }
    }

    async getContestCounter() {
        let timeTrend = await this.repo.getLudoContestHourlyTrend();
        let newData = await this.repo.getPlayerJoinCounter();
        for (let cid in newData) {
            newData[cid] = Number(newData[cid])
        }
        let contestDeltas = await ContestRoomService.CONTEST_DELTA();
        let resp: any = []
        for (let cid in newData) {
            let playerCount = newData[cid]
            if (timeTrend[cid] && playerCount > timeTrend[cid].Low) {
                let contestData = await this.repo.getContestById(cid);
                if (playerCount > timeTrend[cid].High) {
                    playerCount = playerCount * contestData.Highmultiple
                }
                else if (playerCount > timeTrend[cid].Low) {
                    playerCount = playerCount * contestData.Lowmultiple
                }
                playerCount = playerCount + 1
                // + contestDeltas[cid] + Number(Math.abs(Number(cid)).toString().split('')[0])
                playerCount = Math.round(playerCount)
            }
            resp.push({
                contestId: cid,
                playerJoined: playerCount
            })
        }
        return new BaseHttpResponse(resp, null, ERROR_CODE.OK)
    }

    async sendCounters(prevData: any) {
        console.log('Sending counters');
        let newData = await this.repo.getPlayerJoinCounter();
        try {
            let timeTrend = await this.repo.getLudoContestHourlyTrend();
            let resp: any = []
            for (let cid in newData) {
                newData[cid] = Number(newData[cid])
            }
            // let contestDeltas = await ContestRoomService.CONTEST_DELTA();
            let isCounterChanged = this.getContestThatChanged(prevData, newData)
            Log('cont-test', isCounterChanged, prevData, newData);
            if (isCounterChanged.length > 0) {
                for (let i = 0; i < isCounterChanged.length; i++) {
                    let cid = isCounterChanged[i]
                    let playerCount = newData[cid]
                    if (timeTrend[cid] && playerCount > timeTrend[cid].Low) {
                        console.log(cid, playerCount, timeTrend[cid])
                        let contestData = await this.repo.getContestById(cid);
                        if (playerCount > timeTrend[cid].High) {
                            playerCount = playerCount * contestData.Highmultiple
                        }
                        else if (playerCount > timeTrend[cid].Low) {
                            playerCount = playerCount * contestData.Lowmultiple
                        }
                        playerCount = playerCount + Math.floor(Math.random() * (2))
                        //contestDeltas[cid] 
                        //Number(Math.abs(Number(cid)).toString().split('')[0])
                        playerCount = Math.round(playerCount)
                    }
                    resp.push({
                        contestId: cid,
                        playerJoined: playerCount
                    })
                }
                Log('delta_counter', 0, 'Sending counter', resp)
                let httpResp = new BaseHttpResponse(resp, null, ERROR_CODE.OK)
                ContestServer.Instance.counterSocketServer.IO.emit(ContestRoomEvent.CONTEST_COUTER, httpResp);
            }

            // return newData
        } catch (err) {
            console.error('sendCounter error=>', err);
        }
        setTimeout(this.sendCounters.bind(this, newData), 2000);
        return


    }

    async resetContestCount() {
        let newData = await this.repo.getPlayerJoinCounter();
        for (let cid in newData) {
            let resp = await this.repo.resetJoinPlayerCounter(cid)
            console.log('Reset count of ', cid, resp)
        }
    }
    // Increase count of contests after certain time 
    async handleContestWithZero() {
        let newData = await this.repo.getPlayerJoinCounter();
        console.log('Counter on handle function', newData)
        Log('zerobug', 'Counter on handle function', newData)
        for (let cid in newData) {
            try {
                let count = Number(newData[cid])
                let constestData = await this.repo.getContestById(cid);
                let contestConfig = await getGameConfig(constestData);
                Log('zerobug', 'CD in loop=>', cid, contestConfig, constestData)
                let currentTime = Date.now();
                let delayInStart = (currentTime - constestData.StartTime) % (constestData.WaitingTime + constestData.DelayTime)
                let delayPercent = delayInStart / constestData.WaitingTime * 100
                let timeSlot = currentTime - delayInStart;
                let startTime = timeSlot + constestData.WaitingTime
                let timeRemaining = startTime - currentTime
                if (count == 0 && contestConfig != GamePriority.XFAC_OFF) {
                    let randomPercent = Math.floor(Math.random() * (50 - 20)) + 20
                    if (delayPercent > randomPercent) {
                        await this.repo.incJoinPlayerCounter(cid, 1);
                    }
                    Log('zeroCounter', 0, cid, randomPercent, delayInStart, delayPercent, timeRemaining)
                    let contestRoom = <ContestRoomData>await this.repo.searchRoom(cid, timeSlot);
                    if (!contestRoom) {
                        console.log('setTimeout to reset contest count', timeRemaining / 1000)
                        setTimeout((cid) => {
                            console.log('Reset contest count from handle function')
                            this.repo.resetJoinPlayerCounter(cid)

                        }, timeRemaining, cid)
                    }
                } else if (count == 1 && contestConfig != GamePriority.XFAC_OFF) {
                    let randomPercent = Math.floor(Math.random() * (90 - 70)) + 70
                    if (delayPercent > randomPercent) {
                        await this.repo.incJoinPlayerCounter(cid, 1);
                    }
                }
            } catch (err) {
                Log('zeroCounter', 'Error in handle function =>', cid, err.toString())
            }
        }
        // setTimeout(this.handleContestWithZero.bind(this), 10000);
    }

    async resetAllCounter(){
        let newData = await this.repo.getPlayerJoinCounter();
        for (let cid in newData) {
            console.log('Reseting counter', cid);
            this.repo.resetJoinPlayerCounter(cid)
        }

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
                    ContestRoomService.contestDelta[cid] = Math.floor(Math.random() * (3 - 1)) + 1
                }
            }
        }
        return resp
    }
    async calculateContestCounter(timeTrend: any, delta: any) {
        let contestCounters = await this.repo.getPlayerJoinCounter()
        let newData = []
        if (!delta) {
            delta = this.getNewDelta(contestCounters);
        }
        for (const cid in contestCounters) {
            let playerCount = parseInt(contestCounters[cid])
            if (timeTrend[cid] && timeTrend[cid].Level > TimeTrendLevel.LOW) {
                if (timeTrend[cid].Level == TimeTrendLevel.AVG) {
                    playerCount = playerCount * 5
                } else {
                    playerCount = playerCount * 10
                }
                if (playerCount > timeTrend[cid].ThreshHold) playerCount = timeTrend[cid].ThreshHold
                playerCount = playerCount + delta + Number(Math.abs(Number(cid)).toString().split('')[0])
            }
            newData.push({
                contestId: cid,
                playerJoined: playerCount
            })
        }
        return newData
    }

    getNewDelta(contestCounter: any) {
        let contestDeltas: any = {}
        for (let cid in contestCounter) {
            contestDeltas[cid] = Math.floor(Math.random() * (3 - 1)) + 1
        }
        return contestDeltas
    }

    log(_id: string, timeSlot: number, ...args: any) {
        let uid = _id + '-' + timeSlot;
        Log(uid, args);
        return
    }

    public static async CONTEST_DELTA() {
        if (!this.contestDelta) {
            let contestCounter = await this.Instance.repo.getPlayerJoinCounter()
            this.contestDelta = this.Instance.getNewDelta(contestCounter);
        }
        return this.contestDelta;
    }

}

export default ContestRoomService;