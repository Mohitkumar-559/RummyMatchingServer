import Queue from 'bee-queue';
import { TimerRequest } from 'domain/entities/contestRoom/contestRoom.dto';
import ContestRoomService from 'domain/operations/contestRoom/contestRoom.service';
import Redis from 'ioredis';

export class BeeQue {
    private _timerQueue: any;
    private TIMER_QUEUE = 'timer=queue'
    private options = {
        removeOnSuccess: true,
        activateDelayedJobs: true,
        prefix: process.env.NODE_ENV,
        redis: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT),
            lazyConnect: true
        }
    }
    
    public constructor() {
        this.setupConnection()
    }

    private async setupConnection() {
        try {
            console.log('Conceting beeque', this.options);
            this._timerQueue = new Queue(this.TIMER_QUEUE, this.options);
            await this.registerListeners();
            let job = await this._timerQueue.createJob({a: 'testing bq'}).save()
            console.log(job)
        } catch (err) {
            console.log('Error while connecting to BeeQueu', err)
        }
    }

    public async setTimer(request: TimerRequest): Promise<boolean> {
        try {
            let job = await this._timerQueue.createJob(request).delayUntil(Date.now()+request.timeout).save()
            // console.log(job);
        } catch (err) {
            return false
        }
    }

    private async registerListeners(){
        this._timerQueue.process(this.timerListner.bind(this))
    }

    private async timerListner(job: any){
        const jobData: TimerRequest = job.data;
        console.log('JOB receiveed', job.data);
        if(jobData.functionName == 'preStartContestConfig'){
            await ContestRoomService.Instance.preStartContestConfig(jobData.data);
        } else if(jobData.functionName == 'matchMakingActivePlayers') (
            await ContestRoomService.Instance.matchMakingActivePlayers(jobData.data)
        )
        return 'ok'
    }

}
