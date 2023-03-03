import { IUserRequest } from "domain/entities/users/user.dto";
import { Request, Response } from "express";
import DashboardService from "./dashboard.service";



class DashboardController{
    private dashboardService: DashboardService;
    
    public constructor(){
        this.dashboardService = DashboardService.Instance;
    }

    async getMyJoinedContest(_req: IUserRequest, res: Response) {
        var LoggedInUserId = 0;
        LoggedInUserId = _req.profile != null ? _req.profile.mid : 0;
        const result = await this.dashboardService.getMyLudoJoinedContest(LoggedInUserId);
        return res.json(result);
    }

    async getMyRoomdetails(_req: IUserRequest, res: Response) {
        var LoggedInUserId = 0, RoomId = 0;
        LoggedInUserId = _req.profile != null ? _req.profile.mid : 0;
        RoomId = (_req.query != null && _req.query.roomid != undefined) ? parseInt(_req.query.roomid as string) : 0;
        const result = await this.dashboardService.getMyLudoRoomDetails(RoomId,LoggedInUserId);
        return res.json(result);
    }

 

}
export default DashboardController;