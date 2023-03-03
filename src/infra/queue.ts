import client, { Connection, Channel } from 'amqplib'
import { ContestServer } from 'app'
import { RedisTimeout } from 'database/redis/redis.dto'
import { RedisKeys } from 'database/redis/redis.keys'
import { JoinQueueData } from 'domain/entities/users/user.dto'
import { Log } from 'middleware/logger'

export enum MSG_STATUS {
    CREATED = 1,
    RECEIVED = 2,
    PROCESSED = 3,
    ERROR = 4,
    NOT_FOUND = 5
}

export class RabbitMQ {
    private _connection: Connection
    private _channel: Channel
    private GAME_JOIN_QUEUE = 'oneto11-queue-NewLudoJoinGame1'
    private WINNING_GAME_QUEUE = 'oneto11-queue-DeclareLudoResult'
    private LOG_GAME_QUEUE = 'oneto11-queue-CreateLudoEventLog'

    public constructor() {
        this.setupConnection()
    }

    private async setupConnection() {
        try {
            this._connection = await client.connect(
                process.env.RABBITMQ_URL
            )
            this._channel = await this._connection.createChannel();
            console.log('RabbitMQ Connected')
        } catch (err) {
            console.log('Error while connecting to RabbitMQ', err)
        }
    }

    public async pushToWinningQueue(msg: any): Promise<boolean> {
        try {
            const msgBuffer = Buffer.from(JSON.stringify(msg));
            await this._channel.assertQueue(this.WINNING_GAME_QUEUE);
            const resp = this._channel.sendToQueue(this.WINNING_GAME_QUEUE, msgBuffer);
            console.log(resp)
            return resp
        } catch (err) {
            return false
        }
    }

    public async pushToGameJoinQueue(msg: JoinQueueData): Promise<boolean> {
        try {
            const msgBuffer = Buffer.from(JSON.stringify(msg));
            await this._channel.assertQueue(this.GAME_JOIN_QUEUE);
            const resp = this._channel.sendToQueue(this.GAME_JOIN_QUEUE, msgBuffer);
            if(resp){
                await RabbitMQ.addMsgStatusOnRedis(msg.ticket.gameId, MSG_STATUS.CREATED);
            }
            console.log(resp)
            return resp
        } catch (err) {
            return false
        }
    }

    public async pushToLogQueue(msg: any): Promise<boolean> {
        try {
            Log('common', 'Log data in rabbitmQ', msg);
            const msgBuffer = Buffer.from(JSON.stringify(msg));
            await this._channel.assertQueue(this.LOG_GAME_QUEUE);
            const resp = this._channel.sendToQueue(this.LOG_GAME_QUEUE, msgBuffer);
            console.log(resp)
            return resp
        } catch (err) {
            return false
        }
    }

    public static async addMsgStatusOnRedis(msgId: string, status: MSG_STATUS){
        let redisKey = RedisKeys.getRabbitMqMsgKey(msgId);
        return await ContestServer.Instance.REDIS.INSTANCE.pipeline().set(redisKey, status).expire(redisKey, RedisTimeout.MIN_15).exec();
    }
}