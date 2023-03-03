
import { ContestData } from 'domain/entities/contestRoom/contestRoom.dto';
import ContestRoomRepo from 'domain/entities/contestRoom/contestRoom.repo';
import {   PlayerDetails } from 'domain/entities/dashboard/dashboard.dto';
import { DashboardRepo } from 'domain/entities/dashboard/dashboard.repo';
import { ApiResponses, BaseResponse } from 'domain/utils/base.response';




class DashboardService{
    private static _instance: DashboardService;
    
    playerDetails: Array<PlayerDetails> = [];  
    private repo: DashboardRepo;
  
  static get Instance() {
    if(!this._instance) {
      this._instance = new DashboardService();
    }
    return this._instance;
  }
  
  constructor() {
    this.repo = DashboardRepo.Instance;
   }

  async getMyLudoJoinedContest(LoggedInUserId:number){
    let httpResp;
    try
    {
      
      var completedContestResp = await this.repo.getLudoCompletedContestResponse(LoggedInUserId);
      if(completedContestResp.length > 0)
      {
        
        httpResp = new BaseResponse(1,null, completedContestResp, "", null);
      }
      else{
        httpResp = new BaseResponse(ApiResponses.NoRecordFound,null, null, "", "No record found");
     }
  }
  catch(e){
    httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
  }
  return httpResp;
}


  async getMyLudoRoomDetails(roomid: number, userid:number){
    let httpResp;
    try{
      this.playerDetails = await this.repo.getMyLudoRoomDetailsResponse(roomid, userid);
      if(this.playerDetails != undefined && this.playerDetails.length > 0)
      { 
        const ContestId = this.playerDetails[0].ContestId;

        var contestdetails: ContestData;
        try{
            contestdetails = await ContestRoomRepo.Instance.getContestById(ContestId.toString());
        }catch(err){
        }
        
        let  RoomDetails:any = {};
        RoomDetails.contestId = ContestId;
        RoomDetails.winningPrize = contestdetails?.wa ?? 0;
        RoomDetails.contestName = contestdetails?.cn ?? "";
        RoomDetails.joiningfees = contestdetails?.jf ?? 0;
        RoomDetails.isOffline = this.playerDetails[0]?.IsOffline
        let player = [];
        for(let pl of this.playerDetails){
            player.push({
                playerId:pl.PlayerId,
                referCode:pl.ReferCode,
                rank:pl.Rank,
                points:pl.Points,
                winningAmount:pl.WinningAmount, 
                isWiningZone:pl.IsWiningZone, 
                isPrizeAdded: pl.IsPrizeAdded,
                contestId:pl.ContestId,
                gameId:pl.GameId,
                isOffline:pl.IsOffline  
            })
        }
        RoomDetails.players = player;
        
        httpResp = new BaseResponse(1,RoomDetails, null, "", null);
    }
    else{
      httpResp = new BaseResponse(0,null, null, "", "No record found");
    }
  }
  catch(e){
    httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
  }
  return httpResp;
}
 

}
export default DashboardService;