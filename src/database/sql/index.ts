import * as sql from "mssql";
class SqlDB {
    private casualDbConnection: sql.ConnectionPool;
    private transactionDbConnection: sql.ConnectionPool;
    constructor() {
    }
    private async getCasualDb() {
        if (!this.casualDbConnection) {
            this.casualDbConnection = await new sql.ConnectionPool(process.env.GAME_DB_CONN).connect().then(pool => {
                return pool;
            });
        }
        return this.casualDbConnection;
    }

    private async getTransactionDb() {
        if (!this.transactionDbConnection) {
            this.transactionDbConnection = await new sql.ConnectionPool(process.env.TRANSACTION_DB_CONN).connect().then(pool => {
                return pool;
            });
        }
        return this.transactionDbConnection;
    }


    async GetDataFromCasualGame(proc_name: string, param: string) {
        let recordList: any = [];
        try {
            let query = "EXEC " + proc_name + " " + param;
            const result = await (await this.getCasualDb()).query(query)
            recordList = result.recordset;
        }
        catch (err) {
            console.log(err);
        }
        return recordList;
    }

    async GetDataFromTransaction(proc_name: string, param: string) {
        let recordList: any = [];
        try {
            let query = "EXEC " + proc_name + " " + param;
            const result = await (await this.getTransactionDb()).query(query)
            recordList = result.recordset;
        }
        catch (err) {
            console.log(err);
        }
        return recordList;
    }

    async RefundToUser(proc_name:string, tbl:any){
        let refundStatusList:any = []
        try
        {
          let connection = await this.getTransactionDb();
          const request = await new sql.Request(connection);
          request.input('dtRefundedLudoUser', sql.TVP, tbl)
          const result = await request.execute(proc_name);          
          refundStatusList = result.recordset;
        }
        catch(err){
          console.log(err);
        }
        return refundStatusList;
      }

}

export default SqlDB;