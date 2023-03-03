import 'dotenv/config'
import 'reflect-metadata';
import express from 'express'
import * as socketIO from 'socket.io'
import * as http from 'http'
import { AuthenticationService } from 'middleware/auth';
import { SocketServer } from './socket';
import { RedisStorage } from 'database/redis';
import { IUser } from 'domain/entities/users/user.dto';
import { registerCounterSocketEvents, registerEvents } from 'domain/event';
import SqlDB from 'database/sql';
import { routes } from 'domain/routes';
import UserService from 'domain/operations/user/user.service';
import { Log, setupLogger } from 'middleware/logger';
import {RabbitMQ} from 'infra/queue';
import { BeeQue } from 'infra/timer.queue';
import ContestRoomService from 'domain/operations/contestRoom/contestRoom.service';
import { MongoDb } from 'database/mongo';
import { RedisKeys } from 'database/redis/redis.keys';
import bodyParser from 'body-parser';
import { initCronJobs } from 'domain/crons';


abstract class Applicaton {
    constructor() {
        this.configureServices();
    }
    abstract configureServices(): void
}
export class ContestServer extends Applicaton {
    private _userList: Map<string, IUser>;
    private _socketServer: SocketServer;
    private _counterSocketServer: SocketServer;
    private _redisStorage: RedisStorage
    // private _secondaryRedis: RedisStorage;
    private _mongoDb: MongoDb;
    private _sqlDB: SqlDB;
    private _rabbitMq: RabbitMQ;
    private _beeque: BeeQue;
    private app: any;
    private joiningEnable: boolean;
    private static _instance: ContestServer;
    constructor() {
        super();
        this._userList = new Map();
        const options = { host: process.env.REDIS_URL, port: 6379 };
        this._redisStorage = new RedisStorage(options);
        // const secondaryOptions = { host: process.env.SECONDARY_REDIS_URL, port: 6379 }
        // this._secondaryRedis = new RedisStorage(secondaryOptions, true);
        this._sqlDB = new SqlDB();
        this._rabbitMq = new RabbitMQ();
        this._mongoDb = new MongoDb();
        this.joiningEnable = true;
        // this._beeque = new BeeQue();
    }
    static get Instance() {
        if (!this._instance) {
            this._instance = new ContestServer()
            routes(this._instance.app)
        }
        return this._instance
    }
    public configureServices() {
        setupLogger();
        this.app = express();
        this.app.use(bodyParser.json({limit: '50mb'}));
        this.app.use(bodyParser.urlencoded({ extended: true }));
        console.info('test');
        initCronJobs();
       
        const httpServer = http.createServer(this.app);
        
        const instance = httpServer.listen(process.env.PORT, async () => {
            console.log("Contest Server started T on port ", process.env.PORT);
            ContestRoomService.Instance.resetContestCount();
            setTimeout(ContestRoomService.Instance.sendCounters.bind(ContestRoomService.Instance), 5000);
            setInterval(ContestRoomService.Instance.handleContestWithZero.bind(ContestRoomService.Instance), 10000);
            setTimeout(ContestRoomService.Instance.resetAllCounter.bind(ContestRoomService.Instance), 0);
        });
        const socketPath = "/v1/game/socket.io";
        const socketOptions: any = { path: socketPath, pingTimeout: 4000, pingInterval: 4000 };
        this._socketServer = new SocketServer(instance, socketOptions, this.onSocketAuth.bind(this), this.onSocketConnect.bind(this));
        const counterSocketPath = "/v1/counter/socket.io";
        const counterSocketOptions: any = { path: counterSocketPath, pingTimeout: 5000, pingInterval: 3000 };
        this._counterSocketServer = new SocketServer(instance, counterSocketOptions, this.onSocketAuth.bind(this), this.onCounterSocketConnect.bind(this));
        
    }
    private async onSocketAuth(socket: socketIO.Socket, next: any): Promise<any> {
        const token: string = socket.handshake.query.token as string;
        if(!token){
            next(new Error("Token required"));
        }
        const profile: IUser = await AuthenticationService.validateToken(token);
        if(!profile){
            next(new Error("Invalid token"));
        }
        socket.data = profile
        console.log("Socket Auth called ", socket.id);
        next();
        return;
    }
    private onSocketConnect(socket: socketIO.Socket) {
        console.log("Socket connected", socket.id);
        let user: IUser = <IUser>socket.data;
        if(!user) return
        Log('disconnection', `${user.name} connected in Join socket`)
        this.crudPlayer(user, socket);
        // console.log("User List ", this._userList);
    }

    private onCounterSocketConnect(socket: socketIO.Socket){
        console.log("Counter Socket connected", socket.id);
        let user: IUser = <IUser>socket.data;
        if(!user) return
        Log('disconnection', `${user.name} connected in Counter socket`)
        registerCounterSocketEvents(socket);

    }
    private crudPlayer(user: IUser, socket:socketIO.Socket) {
        this._userList.set(user._id, user);
        UserService.Instance.setProfile(user);
        registerEvents(socket);
    }
    public playerInfo(playerId: string) {
        return this._userList.get(playerId)
    }

    public async intialiseJoiningStatus(){
        let joiningEnable;
        try{
            joiningEnable = await ContestServer.Instance.REDIS.get(RedisKeys.LudoJoiningStatus());
        }catch(err){
            joiningEnable = true
        }
        this.JoiningEnable = joiningEnable
    }
    
    public get socketServer() {
        return this._socketServer;
    }
    public get counterSocketServer(){
        return this._counterSocketServer
    }
    public get REDIS() {
        return this._redisStorage;
    }
    
    public get SQL_DB() {
        return this._sqlDB;
    }
    public get RabbitMQ() {
        return this._rabbitMq;
    }
    public get MongoDB() {
        return this._mongoDb;
    }
    public get JoiningEnable(){
        return this.joiningEnable;
    }
    public set JoiningEnable(val:boolean){
        this.joiningEnable = val;
        console.log('NEW VAL OF JOINING', this.joiningEnable)
    }
    // public get BeeQue(){
    //     return this._beeque;
    // }
}
ContestServer.Instance