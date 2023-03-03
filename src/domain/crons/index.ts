import { scheduledFunction } from "./logs";

export async function initCronJobs() {
    if(process.env.IS_PROD != 'true'){
        console.log('Skipping CRONS in DEV ENV')
        return
    }
    scheduledFunction();
}
