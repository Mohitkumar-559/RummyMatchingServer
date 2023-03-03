import { GameMode } from "../contestRoom/contestRoom.dto";

export class TransactionTokenRequest{
    cid: number;
    amt?: number;
    mba?: number;
    gameserverid?:string;
    gameMode: GameMode;
    userList: Array<{UserId:string, UserLoginId: number, ReferCode: string}>;    

}

export class JoinContestResponse{
    ResponseStatus:number;
    RoomId: number;
}

export interface DrawMoneyData {
    RoomId: number,
    ContestId: string,
    participantScores: Array<{UserId: number, Score: number}>
}

export class ContestPrizeBreakUpRequest{
    contestId:number;
    gameId:number;
    LoggedInUserId:number;
}

export class PrivateTransactionTokenRequest{
    amt?: number;
    mba?: number;
    gameserverid:string;
    uniqueid:number;
    gameMode: number;
    userList: Array<{UserId:string, UserLoginId: number, ReferCode: string}>    
}
