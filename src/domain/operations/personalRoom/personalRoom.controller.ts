import { ContestServer } from "app";
import { GameWinningData } from "domain/entities/personalRoom/personalRoom.dto";
import { IUser, IUserRequest } from "domain/entities/users/user.dto";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { Socket } from "socket.io";
import UserService from "../user/user.service";
import PersonalRoomService from "./personalRoom.service";

class PersonalRoomController {
    private _service: PersonalRoomService;

    public constructor() {
        this._service = PersonalRoomService.Instance;
    }

    async createRoom(socket: Socket, body: any, callback: any) {
        const amount: number = body.amount
        const noOfPlayer: number = body.noOfPlayer
        const isOffline: boolean = body.isOffline
        const user: IUser = <IUser>socket.data
        const userService = UserService.Instance;
        if(!ContestServer.Instance.JoiningEnable && !await userService.isTester(user.mid.toString())){
            callback(new BaseHttpResponse(null, 'Server Under Maintenance', ERROR_CODE.SERVER_MAINTENANCE))
            return
        } else if(await userService.checkUserIsBlocked(user.mid)){
            callback(new BaseHttpResponse(null, 'User is blocked', ERROR_CODE.DEFAULT))
            return
        }
        let resp = await this._service.createRoom(user, socket, amount, noOfPlayer, isOffline)
        callback(resp)
    }

    async joinRoom(socket: Socket, body: any, callback: any){
        const roomCode: string = body.roomCode;
        const isOffline: boolean = body.isOffline || false
        const user: IUser = <IUser>socket.data
        const userService = UserService.Instance;
        if(!ContestServer.Instance.JoiningEnable && !await userService.isTester(user.mid.toString())){
            callback(new BaseHttpResponse(null, 'Server Under Maintenance', ERROR_CODE.SERVER_MAINTENANCE))
            return
        } else if(await userService.checkUserIsBlocked(user.mid)){
            callback(new BaseHttpResponse(null, 'You are not authorized', ERROR_CODE.DEFAULT))
            return
        }
        let resp = await this._service.joinRoom(user, socket, roomCode, isOffline)
        PersonalRoomService.Instance.log(roomCode, 'resp of joinRoom ', user.name, resp);
        
        callback(resp)
    }

    async startGame(socket: Socket, body: any, callback: any){
        const roomCode: string = body.roomCode;
        const user: IUser = <IUser>socket.data
        let resp = await this._service.startGame(user, socket, roomCode)
        callback(resp)
    }

    async startOfflineGame(socket: Socket, body: any, callback: any){
        const roomCode: string = body.roomCode;
        const user: IUser = <IUser>socket.data
        let resp = await this._service.startOfflineRoom(user, socket, roomCode)
        callback(resp)
    }

    async leaveRoom(socket: Socket, body: any, callback: any){
        const roomCode: string = body.roomCode;
        const user: IUser = <IUser>socket.data
        let resp = await this._service.leaveRoom(user, socket, roomCode)
        callback(resp)
    }

    async getRoom(socket: Socket, body: any, callback: any){
        const roomCode: string = body.roomCode;
        const isOffline: boolean = body.isOffline || false
        const user: IUser = <IUser>socket.data
        let resp = await this._service.getRoom(user, socket, roomCode, isOffline)
        callback(resp)
    }

    async getRoomPrizeBreakup(socket: Socket, body: any, callback: any){
        const roomCode: string = body.roomCode;
        const user: IUser = <IUser>socket.data
        let resp = await this._service.getRoomPrizeBreakup(user, socket, roomCode)
        callback(resp)
    }

    async declareResult(req: IUserRequest, res: any) {
        console.log('Request come declare', req.body)
        let data: GameWinningData = req.body;
        const resp = await this._service.declareResult(data);
        return res.json(resp);
    }

    async saveRoomLog(req: IUserRequest, res: any) {
        // console.log('Request come to save logs', req.body, JSON.stringify(req.body))
        let data: any = req.body;
        const resp = await this._service.saveGameLog(data, req.body.roomCode);
        return res.json(resp);
    }

    async cancelOfflineRoom(req: IUserRequest, res: any) {
        console.log('+++++++++++++++++++++++++', req.body, req.query)
        let roomId: string = req.body.RoomId?.toString();
        let user: IUser = <IUser>req.profile;
        const resp = await this._service.cancelOfflineRoom(roomId, user);
        console.log('Resp of cancel room=>', resp )
        return res.json(resp);
    }


}

export default PersonalRoomController;