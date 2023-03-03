
import SqlDB from "database/sql";
import { ContestServer } from "app";
import { RedisStorage } from "database/redis";


export class DashboardRepo {
    
    private static _instance: DashboardRepo;
    private sql: SqlDB

    static get Instance() {
        if (!this._instance) {
            this._instance = new DashboardRepo();
        }
        return this._instance;
    }
    constructor() {
        this.sql = ContestServer.Instance.SQL_DB
    }
   
    async getLudoCompletedContestResponse(UserId: number) {
        let result = [];
        try {
            const proc_name = "PROC_GET_Completed_GameContests";
            const param = "@UserId=" + UserId;
            var resp = await this.sql.GetDataFromCasualGame(proc_name, param);
            for(let r of resp){
                result.push({
                    contestId: parseInt(r.ContestId),
                    roomId: parseInt(r.RoomId),
                    gameTypeId: parseInt(r.GameTypeId),
                    contestName: r.ContestName,
                    joinedFee: parseInt(r.JoinedFee),
                    pricePool: parseFloat(r.PricePool),
                    contestDate: r.ContestDate,
                    winningPrice: parseFloat(r.WinningPrice),
                    status: r.Status,
                    score: parseInt(r.Score||0),
                    statusId: r.StatusId,
                    isResultDeclared: r.IsResultDeclared,
                    isWin: r.IsWin,
                    isRefunded: r.IsRefunded,
                    isCashback: r.IsCashback,
                    isOffline: r.IsOffline

                });
            }
        } catch (err: any) {
            console.log('Error while getting contest details', err);
            throw err
        }
        return result;
    }



    async getMyLudoRoomDetailsResponse(roomid: number, userid: number) {
        let result = [];
        try {
            const proc_name = "PROC_GetRoomDetails";
            const param = "@UserId=" + userid + ", @RoomId=" + roomid;
            result = await this.sql.GetDataFromCasualGame(proc_name, param);
        } catch (err: any) {
            console.log('Error while getting room details', err);
            throw err
        }
        return result;
    }
    

}