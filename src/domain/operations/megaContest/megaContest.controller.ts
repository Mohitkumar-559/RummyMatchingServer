import { ContestServer } from "app";
import { IUser, IUserRequest } from "domain/entities/users/user.dto";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import { Socket } from "socket.io";
import UserService from "../user/user.service";
import MegaContestService from "./megaContest.service";

class MegaContestController {
    private _service: MegaContestService;

    public constructor() {
        this._service = MegaContestService.Instance;
    }


    async getContest(req: IUserRequest, res: any) {
        const LoggedInUserId = (req.profile != null && req.profile.mid != undefined) ? req.profile.mid : 0;
        const result = await this._service.getContestList(LoggedInUserId);
        return res.json(result);
    }

    async getContestPrizeBreakUp(_req: IUserRequest, res: any) {
        let contestId = (_req.query != null && _req.query.contestId != undefined) ? parseInt(_req.query.contestId as string) : 0;

        const result = await this._service.getContestPrizeBreakUp(contestId);
        return res.json(result);
    }

    async subToContest(socket: Socket, body: any, callback: any) {
        try {
            const contestId: string = body.contestId
            let clientAppVersion = body.clientAppVersion || '1';

            const userService = UserService.Instance;
            const user: IUser = <IUser>socket.data
            console.log('+++++++++++++++++++', !ContestServer.Instance.JoiningEnable, !await userService.isTester(user.mid.toString()))
            if (!ContestServer.Instance.JoiningEnable && !await userService.isTester(user.mid.toString())) {
                callback(new BaseHttpResponse(null, 'Server Under Maintenance', ERROR_CODE.SERVER_MAINTENANCE))
                return
            } else if (await userService.checkUserIsBlocked(user.mid)) {
                let resp = new BaseHttpResponse(null, 'User is blocked', ERROR_CODE.DEFAULT)
                callback(resp)
                return
            }
            let resp = await this._service.subToContest(contestId, user)
            callback(resp)
        } catch (err) {
            console.error(err);
            return
        }

    }

    async markPresence(socket: Socket, body: any, callback: any) {
        const contestId: string = body.contestId
        const gameStartTime: number = body.gameStartTime;
        const user: IUser = <IUser>socket.data
        let resp = await this._service.markPresence(contestId, gameStartTime, user, socket, body)
        callback(resp)
    }
}

export default MegaContestController