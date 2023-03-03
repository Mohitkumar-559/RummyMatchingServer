import { ContestServer } from "app";
import Redis from "ioredis";
import { RedisTimeout } from "./redis.dto";
import { RedisKeys } from "./redis.keys";
export class RedisStorage {
    private redisClient: Redis;
    private subscriber: Redis;
    private _config: any;
    public constructor(private opts: any, secondary: boolean = false) {
        // this.redisClient = new Redis({
        //     host: process.env.REDIS_HOST,
        //     port: parseInt(process.env.REDIS_PORT),
        //     lazyConnect: true
        // });
        this._config = opts;
        this.redisClient = new Redis(opts.host);
        this.redisClient.on("error", (err: any) => {
            console.log("Redis error", err);
        });
        this.redisClient.on("connect", () => {
            console.log("Redis connected");
            if(!secondary){
                this.registerListener();
            }
        });

    }

    private async registerListener() {
        this.subscriber = await this.redisClient.duplicate()
        this.subscriber.config('SET', 'notify-keyspace-events', 'KEA');
        this.subscriber.subscribe(`__keyspace@0__:${RedisKeys.LudoJoiningStatus()}`);
        this.subscriber.on('message', async function (channel: any, key: any) {
            console.log('REDIS CHANGE DETECTED', channel, key);
            let joiningEnable;
            try {
                joiningEnable = await ContestServer.Instance.REDIS.get(RedisKeys.LudoJoiningStatus());
            } catch (err) {
                joiningEnable = true
            }

            ContestServer.Instance.JoiningEnable = joiningEnable
        });
        await ContestServer.Instance.intialiseJoiningStatus();
    }

    public get Instance() {
        return
    }


    public async hgetall(key: string): Promise<any> {
        const data = await this.redisClient.hgetall(key);
        return data;
    }
    public async hmget(key: string, fields: string) {
        const data = await this.redisClient.hmget(key, fields);
        return data;
    }
    public async hget(key: string, fields: string) {
        // console.error('Service', this._config)
        const data = await this.redisClient.hget(key, fields);
        return data;
    }

    public async hpop(key: string, fields: string) {
        let resp: any = "";
        try {
            const data = await this.redisClient.pipeline().hget(key, fields).hdel(key, fields).exec();
            resp = data && data?.length > 0 ? data[0][1] : data;
        } catch (err) {
            resp = ""
        }
        return resp

    }


    public async hset(key: string, value: string, expire: number = RedisTimeout.ONE_DAY) {
        return await this.redisClient.pipeline().hset(key, value).expire(key, expire).exec();
    }
    public async hmset(key: string, data: any, expire: number = RedisTimeout.ONE_DAY) {
        try {
            const resp = await this.redisClient.pipeline().hmset(key, data).expire(key, expire).exec();
            console.log("resp ", resp);
            return resp
        } catch (error) {
            console.error("error in hmset", error);
        }
    }

    public async get(key: string) {
        const resp = await this.redisClient.get(key);
        return JSON.parse(resp)
    }

    public async set(key: string, data: any, expire: number = RedisTimeout.ONE_DAY) {
        const resp = await this.redisClient.pipeline().set(key, JSON.stringify(data)).expire(key, expire).exec();
        return resp
    }

    public async sadd(key: string, value: any, expire: number = RedisTimeout.ONE_DAY) {
        return await this.redisClient.pipeline().sadd(key, value).expire(key, expire).exec();
    }

    public async sismember(key: string, value: any) {
        return await this.redisClient.sismember(key, value)
    }

    public async smembers(key: string): Promise<string[]> {
        const data = await this.redisClient.smembers(key);
        return data;
    }

    public async hincrby(key: string, field: string, inc: number) {
        return await this.redisClient.hincrby(key, field, inc);
    }

    public async scard(key: string) {
        return await this.redisClient.scard(key);
    }

    public async rpush(key: string, value: any, expire: number = RedisTimeout.ONE_DAY) {
        return await this.redisClient.pipeline().rpush(key, value).expire(key, expire).exec()
    }

    public async rpop(key: string) {
        return await this.redisClient.rpop(key);
    }

    public async sdiff(...keys: string[]) {
        return await this.redisClient.sdiff(keys);
    }


    get INSTANCE() {
        return this.redisClient
    }
}