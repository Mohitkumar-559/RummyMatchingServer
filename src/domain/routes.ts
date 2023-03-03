import {Express} from 'express-serve-static-core';
import express, { NextFunction, Response } from 'express'
import { AuthenticationService } from 'middleware/auth';
import ContestRoomController from './operations/contestRoom/contestRoom.controller';
import multer from 'multer';
import { Request } from 'mssql';
import upload from 'middleware/upload';
import PersonalRoomController from './operations/personalRoom/personalRoom.controller';
import DashboardController from './operations/dashboard/dashboard.controller';
import MegaContestController from './operations/megaContest/megaContest.controller';
export function routes(app: Express) {    
    const contestController = new ContestRoomController();
    const roomController = new PersonalRoomController();
    const dashboardController = new DashboardController();
    const megaContestController = new MegaContestController();
    const authRouter = express.Router();
    const nonAuthRouter = express.Router();
    
    authRouter.use('/',AuthenticationService.authenticateApiRequest)
    authRouter.get('/contest/getContest', contestController.getContestList.bind(contestController));
    authRouter.get('/v2/contest/getContest', contestController.getContestListV2.bind(contestController));
    authRouter.get('/free/contest/getContest', contestController.getFreeContestList.bind(contestController));
    authRouter.get('/contest/getContestById', contestController.getContestById.bind(contestController));
    authRouter.get('/contest/getUserJoinContest', contestController.getUserJoinContest.bind(contestController));
    authRouter.post('/upload',upload.array('logs',1), contestController.upload.bind(contestController));
    
    authRouter.get('/dashboard/getMyJoinedContest', dashboardController.getMyJoinedContest.bind(dashboardController));
    authRouter.get('/dashboard/getMyRoomdetails', dashboardController.getMyRoomdetails.bind(dashboardController));
    
    // Offline room API
    authRouter.post('/offlineRoom/declareResult', roomController.declareResult.bind(roomController));
    authRouter.post('/offlineRoom/saveLog', roomController.saveRoomLog.bind(roomController));
    authRouter.post('/offlineRoom/cancel', roomController.cancelOfflineRoom.bind(roomController));
    
    // Mega contest API
    authRouter.get('/tournament/prizeBreakUp', megaContestController.getContestPrizeBreakUp.bind(megaContestController));
    
    nonAuthRouter.get('/contest/getContestPrizeBreakUp', contestController.getContestPrizeBreakUp.bind(contestController));
    
    app.use('/api',authRouter).use('/server',nonAuthRouter).get('/', (request, response) => {
        response.send(`MatchMaking server in running (${new Date()})`);
    });
    
    // app.use('/api',authRouter).use('/server',nonAuthRouter);
    
};
