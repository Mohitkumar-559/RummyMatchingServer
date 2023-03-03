import { ContestServer } from "app";
import { RedisStorage } from "database/redis";
import SqlDB from "database/sql";
import { TransactionTokenRequest } from "./transaction.dto";
import * as sql from "mssql";
import { IUser } from "../users/user.dto";
import { MegaContestData } from "../megaContest/megaContest.dto";

class TransactionRepo {
    private static _instance: TransactionRepo;
    private redis: RedisStorage
    public sql: SqlDB

    static get Instance() {
        if (!this._instance) {
            this._instance = new TransactionRepo();
        }
        return this._instance;
    }

    constructor() {
        this.redis = ContestServer.Instance.REDIS
        this.sql = ContestServer.Instance.SQL_DB
    }

    async deductBalance(data: TransactionTokenRequest) {
        const proc_name = "PROC_DEDUCT_JOIN_LUDO_FEES";
        let param = "@GameId=1, @ContestId=" + data.cid;
        param = param + ", @Amount=" + data.amt + ", @GameTypeId=2, @MaxBonusAllowed=" + data.mba;
        param = param + ", @GameServerId='" + data.gameserverid + "'";
        param = param + ", @dtUserJson='" + JSON.stringify(data.userList) + "'";
        var result = await this.sql.GetDataFromTransaction(proc_name, param);
        return result
    }

    async createLudoRoom(data: TransactionTokenRequest, userList: any[]) {
        const game_proc_name = "PROC_CreateLudoRoomAndAssignToUser";
        let gameParam = "@GameMode=" + data.gameMode + ", @ContestId=" + data.cid + ", @GameServerId='" + data.gameserverid + "'";
        gameParam = gameParam + ", @dtLudoRoomParticipantsJson='" + JSON.stringify(userList) + "'";
        var gameResult = await this.sql.GetDataFromCasualGame(game_proc_name, gameParam);
        return gameResult;
    }

    async refundBalance(userList: any[]) {
        var tbl_RefundUserList = new sql.Table();
        tbl_RefundUserList.columns.add("UserId", sql.VarChar(50), { nullable: true });
        tbl_RefundUserList.columns.add("WalletTransactionId", sql.BigInt, { nullable: true });

        for (let ul of userList) {
            tbl_RefundUserList.rows.add(ul.UserId, ul.WalletTransactionId);
        }

        const proc_refund_name = "PROC_REFUND_LUDO_GAME_ENTRY_FEE";
        var refund_result = await this.sql.RefundToUser(proc_refund_name, tbl_RefundUserList);
        return refund_result;
    }

    async deductTournamentBalance(user: IUser, contest: MegaContestData) {
        let tournamentKey = contest.cid + '-' + contest.GameStartTime;
        const procName = 'PROC_DEDUCT_JOIN_TOURNAMENT_LUDO_FEES'
        const procParam = `@GameId=1, @ContestId=${contest.cid}, @CategoryId=${contest.catid}, 
                               @Amount=${contest.ja}, @GameTypeId=2, @MaxBonusAllowed=${contest.mba}, 
                               @GameServerId='${tournamentKey}', @UserId='${user._id}', 
                               @UserLoginId=${user.mid}, @ReferCode='${user.referCode}'`
        const resp = await this.sql.GetDataFromTransaction(procName, procParam);
        return resp;
    }

}

export default TransactionRepo;