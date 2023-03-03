import { configure, getLogger } from "log4js";

export async function setupLogger() {
  const LOG_DIR = process.env.LOG_DIR || "./logs"
  
  configure({
    appenders: {
      everything: {
        type: 'multiFile', base: 'logs/', property: 'gameId', extension: '.log',
        maxLogSize: 10485760, backups: 3, compress: true
      }
    },
    categories: {
      default: { appenders: ['everything'], level: process.env.LOG_LEVEL }
    }
  });
  // configure(LOG_DIR);


}


export const Log = (gameId: string, ...args: any) => {
  const userLogger = getLogger('game');
  userLogger.addContext('gameId', gameId);
  const logs = args.map((val: any)=>{
    let log = JSON.stringify(val);
    return log == '{}' ? val : log
  })
  userLogger.info('', ...logs);
}
