import { ContestServer } from "app";
import { ContestData, ContestRoomData, GameTicketData } from "domain/entities/contestRoom/contestRoom.dto";
import ContestRoomRepo from "domain/entities/contestRoom/contestRoom.repo";
import { IUser, JoinQueueData, RunningContestData } from "domain/entities/users/user.dto";
import UserRepo from "domain/entities/users/user.repo";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { postReq } from "domain/utils/request";
import { Log } from "middleware/logger";
import { Socket } from "socket.io";


class UserService {
    private static _instance: UserService;
    private repo: UserRepo;
    public JOIN_GAME_URL: string = '/api/game/join'

    static get Instance() {
        if (!this._instance) {
            this._instance = new UserService();
        }
        return this._instance;
    }

    constructor() {
        this.repo = UserRepo.Instance;
    }

    async canJoinContest(contestId: string, userMid: number) {
        try {
            const contestRoomRepo = ContestRoomRepo.Instance
            const contestDetails = await contestRoomRepo.getContestById(contestId);
            if (!contestDetails) {
                console.log('INVALID CONTEST')
                throw new BaseHttpResponse(null, "Invalid Contest", ERROR_CODE.DEFAULT);
            }
            var userBalance = await this.repo.getUserBalance(userMid);
            if (!userBalance) {
                console.log('Invalid userId')
                throw new BaseHttpResponse(null, "Unable to fetch user balance", ERROR_CODE.DEFAULT);
            }
            userBalance = userBalance[0]['Balance']
            if (Number(userBalance) < Number(contestDetails.ja)) {

                throw new BaseHttpResponse({ balanceRequired: Math.abs(Number(userBalance) - Number(contestDetails.ja)) }, "Insufficient Balance",
                    ERROR_CODE.INSUFFICIENTBALANCE);
            }
            return true
        } catch (err: any) {
            console.log('Error while checking user can join contest', err);
            throw err
        }
    }

    async checkUserBalance(userId: number, amount: number): Promise<boolean>{
        try{
            var userBalance = await this.repo.getUserBalance(userId);
            if (!userBalance || userBalance.length <= 0) {
                console.log('Invalid userId')
                Log('balance-error', userBalance, userId, amount);
                throw new BaseHttpResponse(null, "Unable to fetch user balance", ERROR_CODE.DEFAULT);
            }
            userBalance = userBalance[0]['Balance']
            if (Number(userBalance) < amount) {
                throw new BaseHttpResponse({ balanceRequired: amount }, "Insufficient Balance",
                    ERROR_CODE.INSUFFICIENTBALANCE);
            }
            return true
        } catch(err){
            console.error('Error in check user bal=>', err, userId, amount, userBalance);
            throw err
        }
    }

    async joinContest(contestId: string, timeSlot: number, userId: string) {
        let resp = await this.repo.addInContestRoom(contestId, timeSlot, userId);
        return resp
    }

    async markActiveUser(contestId: string, timeSlot: number, userId: string) {
        let resp = await this.repo.addInActiveUser(contestId, timeSlot, userId);
        return resp
    }

    async checkAlreadyJoinedContest(contestId: string, timeSlot: number, userId: string) {
        let resp = await this.repo.existInContestRoom(contestId, timeSlot, userId);
        return resp
    }

    async getUnactivePlayer(contestId: string, timeSlot: number) {
        let resp = await this.repo.getUnactivePlayer(contestId, timeSlot);
        return resp
    }

    async checkAlreadyInActiveUser(contestId: string, timeSlot: number, userId: string) {
        let resp = await this.repo.existInActiveUser(contestId, timeSlot, userId);
        return resp
    }

    async deductBalanceForMegaContest(user:IUser, contestId: string){
        return true;
    }

    async emit(data: any, event: string, socket?: Socket, userId?: string) {
        if (socket) {
            return socket.emit(event, data);
        } else if (userId) {
            let user = ContestServer.Instance.playerInfo(userId)
            if (user && user.socket) {
                await user.socket.emit(event, data)
            }
        }
        return true
    }
    async joinSocketRoom(roomId: string, socket?: Socket, userId?: string) {
        Log('common', 'User come to join room', roomId, socket.id, socket.data.name)
        let resp:any;
        if (socket) {
            Log('common', 'Player join with socket direct', socket.data.name)
            resp = await socket.join(roomId)
        } else if (userId) {
            
            let user = ContestServer.Instance.playerInfo(userId)
            if (user && user.socket) {
                Log('common', 'Player join with socket server', roomId, user.socket.data.name)
                resp = await user.socket.join(roomId)
            }
        } else {
            Log('common', 'Player cannot join', socket.data, userId);
        }
        let clients = ContestServer.Instance.socketServer.IO.sockets.adapter.rooms.get(roomId)
        Log('common', clients)
        return resp

    }
    async emitInRoom(roomId: string, event: string, data: any) {
        return ContestServer.Instance.socketServer.emitToSocketRoom(roomId, event, data)
    }

    timeout(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async joinGame(playerId: string, ticket: GameTicketData) {
        const user: IUser = await this.fetchProfile(playerId);
        // const hookData = {
        //     ticket,
        // }
        const queueData: JoinQueueData = {
            ticket: ticket,
            user: user
        }
        // const options = {
        //     headers: {
        //         'x-access-token': user.token
        //     },
        //     json: true
        // }
        // const url = ticket.serverIp+this.JOIN_GAME_URL;
        // console.log('URL =>', url)
        // const result = await postReq(url, hookData, options);
        let resp = await ContestServer.Instance.RabbitMQ.pushToGameJoinQueue(queueData);
        // return result.body;
        return resp
    }

    async fetchProfile(playerId: string) {
        let profile: IUser = ContestServer.Instance.playerInfo(playerId);
        if (!profile) {
            profile = await this.repo.fetchProfile(playerId);
        }
        return profile;
    }

    async setProfile(data: IUser){
        return await this.repo.setProfile(data);
    }

    async addRunningContest(userId: string, contestId: string, timeSlot: number){
        let data: RunningContestData = {
            contestId: contestId,
            timeSlot: timeSlot,
            ticketAssigned: false,
            ticketData: null
        }
        await this.repo.setRunningContest(userId, data);
        return
    }

    async saveAssignedTicket(userId: string, ticket: GameTicketData){
        let data: any = {
            contestId: ticket.contestId,
            timeSlot: ticket.timeSlot,
            ticketAssigned: true,
            ticketData: JSON.stringify(ticket)
        } 
        await this.repo.setRunningContest(userId, data)
    }

    async getRunningContest(userId: string){
        const runningContestData: RunningContestData = await this.repo.getRunningContest(userId);
        return runningContestData
    }

    async isTester(userId: string){
        let resp = await this.repo.isTester(userId);
        return resp
    }

    async getXfacData(opponentId: string, contestData: any, timeSlot: number){
        try{
            let opponentMid: number = (await this.fetchProfile(opponentId)).mid
            let {userId, xFacLevel, userMid, xFacLogId} = await this.repo.getXfacUser(contestData.ja, contestData.mba, opponentMid,contestData.cid + '-' + timeSlot);
            return {userId, xFacLevel, userMid, xFacLogId}
        } catch(err){
            return {
                userId: null,
                xFacLevel: null,
                userMid: null,
                xFacLogId: null
            }
        }
        
    }

    async isPresetUser(userId: string, contestId: string){
        return await this.repo.isPresetUser(userId, contestId);
    }

    async checkUserIsBlocked(userId: number){
        return await this.repo.isBlockedUser(userId);
    }

    async freeUser(userMid: number){
        return await this.repo.freeXfacUSer(userMid);
    }

}

export default UserService;