import { v4 as uuid } from 'uuid';


export enum ERROR_CODE{
    DEFAULT = 400,
    UNAUTHORISE = 401,
    FAILED = 0,
    EXCEPTION = 2, 
    INVALIDREQUEST = 3,   
    CONTESTNOTFOUND = 4,
    INSUFFICIENTBALANCE = 501,
    CLIENT_OUTDATED = 5,
    RESYNC = 6,
    OK = 200,
    EARLY_PRESENCE = 7,
    SERVER_MAINTENANCE = 8
}


export class BaseHttpResponse {
    constructor(
      public readonly data: any = {},
      public readonly error: string | null = null,
      public readonly statusCode: number,
      public readonly timestamp: number = Date.now(),
      public readonly msgUuid: string = uuid()
    ) {}
  
    static success(data: any, statusCode = 200) {
      return new BaseHttpResponse(data, null, statusCode)
    }
  
    static failed(msg: string, statusCode = 400) {
      return new BaseHttpResponse(null, msg, statusCode)
    }
  }
  