import { RedisKeys } from "database/redis/redis.keys";
import { ContestData, ContestRoomData } from "domain/entities/contestRoom/contestRoom.dto";
import ContestRoomRepo from "domain/entities/contestRoom/contestRoom.repo";
import { JoinContestResponse, PrivateTransactionTokenRequest, TransactionTokenRequest } from "domain/entities/transactions/transaction.dto";
import TransactionRepo from "domain/entities/transactions/transaction.repo";
import { BaseHttpResponse, ERROR_CODE } from "domain/utils/error";
import ContestRoomService from "../contestRoom/contestRoom.service";
import * as sql from "mssql";
import { Log } from "middleware/logger";
import { IUser } from "domain/entities/users/user.dto";
import { MegaContestData } from "domain/entities/megaContest/megaContest.dto";


export class TransactionService {
    private static _instance: TransactionService;
    private repo: TransactionRepo;

    static get Instance() {
        if (!this._instance) {
            this._instance = new TransactionService();
        }
        return this._instance;
    }

    constructor() {
        this.repo = TransactionRepo.Instance;
    }


    async JoinContest(request: TransactionTokenRequest, room: ContestRoomData) {
        
        let joinContestRespone = new JoinContestResponse();
        const contestRoomRepo = ContestRoomRepo.Instance;
        const contestRoomService =  ContestRoomService.Instance;
        let responseStatus = 0;
        try {
            console.log(request);
            contestRoomService.log(room.contestId, room.timeSlot, `Request come to create room`, request);

            var contestData: ContestData = await contestRoomRepo.getContestById(request.cid.toString());

            if (contestData != null) {
                request.amt = contestData.ja;
                request.mba = contestData.mba;
                var result = await this.repo.deductBalance(request);
                if (result.length > 0) {
                    console.log("Result : " + result);

                    contestRoomService.log(room.contestId, room.timeSlot, `Deduct money before room creation `, result);
                    let dtLudoRoomParticipants = [];

                    for (let o of result) {
                        var objParticipants = {
                            UserId: o.UserId,
                            UserLoginId: o.UserLoginId,
                            WalletTransactionId: o.WalletTransactionId,
                            ReferCode: o.ReferCode
                        };
                        if (o.ResponseStatus == 1) {
                            dtLudoRoomParticipants.push(objParticipants);
                        }
                        else if (o.ResponseStatus == 501) {
                            throw new BaseHttpResponse(null, 'Insufficient balance', ERROR_CODE.INSUFFICIENTBALANCE)
                        }
                        else {
                            throw new BaseHttpResponse(null, "Transaction failed", ERROR_CODE.FAILED);
                        }
                    }
                    var gameResult = await this.repo.createLudoRoom(request, dtLudoRoomParticipants);
                    if (gameResult.length > 0) {
                        responseStatus = gameResult[0].status;
                        if (responseStatus == 1 && gameResult[0].RoomId > 0) {
                            joinContestRespone.ResponseStatus = 1;
                            joinContestRespone.RoomId = gameResult[0].RoomId;

                            contestRoomService.log(room.contestId, room.timeSlot, `Room creation successfully`, gameResult);

                        }
                        else {
                            var refund_result = await this.repo.refundBalance(dtLudoRoomParticipants);
                            joinContestRespone.ResponseStatus = 0;
                            contestRoomService.log(room.contestId, room.timeSlot, `Refund money in step 1`, gameResult);

                            throw new BaseHttpResponse(null, "Room creation failed", ERROR_CODE.FAILED);
                        }
                    }
                    else {
                        var refund_result1 = await this.repo.refundBalance(dtLudoRoomParticipants);
                        joinContestRespone.ResponseStatus = 0;
                        contestRoomService.log(room.contestId, room.timeSlot, `Refund money in step 2`, gameResult);
                        throw new BaseHttpResponse(null, "Room creation failed", ERROR_CODE.FAILED);
                    }
                }
                else {
                    joinContestRespone.ResponseStatus = 0;
                    throw new BaseHttpResponse(null, "Transaction failed", ERROR_CODE.FAILED);
                }
            }
            else {
                throw new BaseHttpResponse(null, "Contest does not exists", ERROR_CODE.CONTESTNOTFOUND);
            }

        }
        catch (ex: any) {
            joinContestRespone.ResponseStatus = 0;
            throw new BaseHttpResponse(null, JSON.stringify(ex.message), ERROR_CODE.EXCEPTION);
        }
        return joinContestRespone;
    }

    async JoinOfflineContest(request: PrivateTransactionTokenRequest, roomCode: string) {
        let joinContestRespone = new JoinContestResponse();
        let responseStatus = 0;
        try {
            console.log(request);
            Log(roomCode, `Request come to private offline room creation`, request);
            const contestId = '-3';
            request.mba = 0;
            const proc_name = "PROC_DEDUCT_JOIN_LUDO_FEES";
            let param = "@GameId=1, @ContestId=-3";
            param = param + ", @Amount=" + request.amt + ", @GameTypeId=2, @MaxBonusAllowed=" + request.mba;
            param = param + ", @GameServerId='" + request.gameserverid + "'";
            param = param + ", @dtUserJson='" + JSON.stringify(request.userList) + "'";
            var result = await this.repo.sql.GetDataFromTransaction(proc_name, param);
            if (result.length > 0) {
                console.log("Result : " + result);
                Log(roomCode, `Deduct money before room creation `, result);
                let dtLudoRoomParticipants = [];
                for (let o of result) {
                    var objParticipants = {
                        UserId: o.UserId,
                        UserLoginId: o.UserLoginId,
                        WalletTransactionId: o.WalletTransactionId,
                        ReferCode: o.ReferCode
                    };
                    if (o.ResponseStatus == 1) {
                        dtLudoRoomParticipants.push(objParticipants);
                    }
                    else if (o.ResponseStatus == 501) {
                        
                        throw new BaseHttpResponse(null, "Insufficient balance", ERROR_CODE.INSUFFICIENTBALANCE);
                    }
                    else {
                        throw new BaseHttpResponse(null, "Transaction failed", ERROR_CODE.FAILED);
                    }

                }
                const game_proc_name = "PROC_CreateOfflineLudoRoomAndAssignToUser";
                let gameParam = "@GameMode="+ request.gameMode + ",@ContestId=-3, @GameServerId='" + request.gameserverid + "'";
                gameParam = gameParam + ", @UniqueId=" + request.uniqueid + ", @dtLudoRoomParticipantsJson='" + JSON.stringify(dtLudoRoomParticipants) + "'";
                var gameResult = await this.repo.sql.GetDataFromCasualGame(game_proc_name, gameParam);
                if (gameResult.length > 0) {
                    responseStatus = gameResult[0].status;
                    if (responseStatus == 1 && gameResult[0].RoomId > 0) {
                        joinContestRespone.ResponseStatus = 1;
                        joinContestRespone.RoomId = gameResult[0].RoomId;

                        Log(roomCode, `Room creation successfully`, gameResult);
                    }
                    else {
                        var tbl_RefundUserList = new sql.Table();
                        tbl_RefundUserList.columns.add("UserId", sql.VarChar(50), { nullable: true });
                        tbl_RefundUserList.columns.add("WalletTransactionId", sql.BigInt, { nullable: true });

                        for (let ul of dtLudoRoomParticipants) {
                            tbl_RefundUserList.rows.add(ul.UserId, ul.WalletTransactionId);
                        }

                        const proc_refund_name = "PROC_REFUND_LUDO_GAME_ENTRY_FEE";
                        var refund_result = await this.repo.sql.RefundToUser(proc_refund_name, tbl_RefundUserList);

                        Log(roomCode, `Refund money in step 1 `, gameResult);

                        joinContestRespone.ResponseStatus = 0;
                        throw new BaseHttpResponse(null, "Room creation failed", ERROR_CODE.FAILED);
                    }
                }
                else {

                    var tbl_RefundUserList = new sql.Table();
                    tbl_RefundUserList.columns.add("UserId", sql.VarChar(50), { nullable: true });
                    tbl_RefundUserList.columns.add("WalletTransactionId", sql.BigInt, { nullable: true });

                    for (let ul of dtLudoRoomParticipants) {
                        tbl_RefundUserList.rows.add(ul.UserId, ul.WalletTransactionId);
                    }

                    const proc_refund = "PROC_REFUND_LUDO_GAME_ENTRY_FEE";
                    var refund_result1 = await this.repo.sql.RefundToUser(proc_refund, tbl_RefundUserList);

                    Log(roomCode, `Refund money in step 2 `, gameResult);

                    joinContestRespone.ResponseStatus = 0;
                    throw new BaseHttpResponse(null, "Room creation failed", ERROR_CODE.FAILED);
                }
            }
            else {
                joinContestRespone.ResponseStatus = 0;
                throw new BaseHttpResponse(null, "Transaction failed", ERROR_CODE.FAILED);
            }


        }
        catch (ex: any) {
            joinContestRespone.ResponseStatus = 0;
            throw new BaseHttpResponse(null, JSON.stringify(ex.message), ERROR_CODE.FAILED);
        }
        return joinContestRespone;
    }

    async deductBalanceForMegaContest(user: IUser, contest: MegaContestData){
        try{
            const resp = await this.repo.deductTournamentBalance(user, contest);
            if(!resp || resp?.length<=0){
                throw new Error('Null data from store procedure in deductBalanceForMegaContest');
            }
            if(resp[0]?.ResponseStatus == 1){
                return true
            }


        } catch(err){
            console.error('Error in deductBalanceForMegaContest=>', err);
            return false;            
        }
    }
}