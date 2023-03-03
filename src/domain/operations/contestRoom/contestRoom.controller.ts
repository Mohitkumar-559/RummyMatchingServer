import { IUser, IUserRequest } from "domain/entities/users/user.dto";
import { Socket } from "socket.io";
import ContestRoomService from "./contestRoom.service";
import { ContestPrizeBreakUpRequest } from "domain/entities/transactions/transaction.dto";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import ContestRoomRepo from "domain/entities/contestRoom/contestRoom.repo";
import { ContestServer } from "app";
import UserService from "../user/user.service";
import { NextFunction, Request, Response } from "express";
import uploadFileMiddleware from "middleware/upload";
import { GameMode } from "domain/entities/contestRoom/contestRoom.dto";

class ContestRoomController {
    private _service: ContestRoomService;

    public constructor() {
        this._service = ContestRoomService.Instance;
    }

    async subToContest(socket: Socket, body: any, callback: any) {
        const contestId: string = body.contestId
        let clientAppVersion = body.clientAppVersion || '1';

        const userService = UserService.Instance;
        const user: IUser = <IUser>socket.data
        console.log('+++++++++++++++++++', !ContestServer.Instance.JoiningEnable, !await userService.isTester(user.mid.toString()))
        if(!ContestServer.Instance.JoiningEnable && !await userService.isTester(user.mid.toString())){
            callback(new BaseHttpResponse(null, 'Server Under Maintenance', ERROR_CODE.SERVER_MAINTENANCE))
            return
        } else if(await userService.checkUserIsBlocked(user.mid)){
            callback(new BaseHttpResponse(null, 'User is blocked', ERROR_CODE.DEFAULT))
            return
        }
        // if(Number(clientAppVersion)<93){
        //     callback(new BaseHttpResponse(null, 'Please update your app', ERROR_CODE.SERVER_MAINTENANCE))
        //     return
        // }
        let resp = await this._service.subToContest(contestId, user, socket)
        callback(resp)
    }

    async markPresence(socket: Socket, body: any, callback: any) {
        const contestId: string = body.contestId
        const timeSlot: number = body.timeSlot;
        const user: IUser = <IUser>socket.data
        let resp = await this._service.markPresence(contestId, timeSlot, user, socket, body)
        callback(resp)
    }

    async getContestList(req: IUserRequest, res: any) {
        const LoggedInUserId = (req.profile != null && req.profile.mid != undefined) ? req.profile.mid : 0;
        const result = await this._service.getContestList(LoggedInUserId);
        return res.json(result);
    }

    async getContestListV2(req: IUserRequest, res: any) {
        const LoggedInUserId = (req.profile != null && req.profile.mid != undefined) ? req.profile.mid : 0;
        const gameMode: any = req.query.gameMode || '0';
        const result = await this._service.getContestListV2(LoggedInUserId, Number(gameMode));
        return res.json(result);
    }

    async getFreeContestList(req: IUserRequest, res: any) {
        const LoggedInUserId = (req.profile != null && req.profile.mid != undefined) ? req.profile.mid : 0;
        const gameMode: any = req.query.gameMode || GameMode.TIME_BASED;
        const result = await this._service.getFreeContestList(LoggedInUserId, Number(gameMode));
        return res.json(result);
    }

    async getContestById(_req: IUserRequest, res: any) {
        const contestId = (_req.query != null && _req.query.contestId != undefined) ? parseInt(_req.query.contestId as string) : 0;
        const result = await this._service.getContestById(contestId);
        return res.json(result);
    }

    async getContestPrizeBreakUp(_req: IUserRequest, res: any) {
        var request = new ContestPrizeBreakUpRequest();
        request.gameId = 1;
        request.contestId = (_req.query != null && _req.query.contestId != undefined) ? parseInt(_req.query.contestId as string) : 0;

        const result = await this._service.getContestPrizeBreakUp(request);
        return res.json(result);
    }

    async getServerTime(socket: Socket, body: any, callback: any){
        let resp =  {
            serverTime: Date.now()
        }
        let httpResp = new BaseHttpResponse(resp, '', ERROR_CODE.OK);
        callback(httpResp)
    }

    async checkSubscription(socket: Socket, body: any, callback: any){
        const user: IUser = <IUser>socket.data
        let resp = await this._service.checkSubscription(user._id);
        callback(resp);
    }

    async getUserJoinContest(_req: IUserRequest, res: any) {
        const userId = (_req.query != null && _req.query.contestId != undefined) ? parseInt(_req.query.contestId as string) : 0;
        const result = await this._service.getUserJoinContest(userId);
        return res.json(result);
    }

    async getContestCounter(socket: Socket, body: any, callback: any) {
        let resp = await this._service.getContestCounter();
        callback(resp)
    }

    async upload(req: Request, res:Response, next :NextFunction){
  
        // let newProduct = new ProductModel({
        //      name: req.body.name,
        //      price: req.body.price,
        //      images: req.files
        // });
        // await newProduct.save();
        res.send("OK");
     }

}

export default ContestRoomController;