export class BaseResponse {
  
    constructor(
      
      public readonly rs:number,
      public readonly res:any,
      public readonly rc:any[],
      public readonly msgkey:string,
      public readonly error:string,
      public readonly rfc:string = "",
      public readonly aavmn:string = process.env.AAVMN,
      public readonly aavmx:string = process.env.AAVMX,
      public readonly aauu:string = process.env.AAUU,
      public readonly iavmn:string = process.env.IAVMN,
      public readonly iavmx:string = process.env.IAVMX,
      public readonly iauu:string = process.env.IAUU,
      public status:boolean = true

    ) {
     
     if(this.rc == undefined || this.rc == null ){
      this.rc = [];
     }
    }
  
    static success(rs:number, res:any, rc:any[], msgkey=process.env.API_MSG_KEY
        ,error="", rfc = ""
        ,aavmn=process.env.AAVMN,aavmx=process.env.AAVMX,aauu=process.env.AAUU
        ,iavmn=process.env.IAVMN, iavmx=process.env.IAVMX, iauu=process.env.IAUU) {
      return new BaseResponse(rs, res, rc,msgkey, null,rfc, aavmn, aavmx, aauu, iavmn, iavmx, iauu)
    }
  
    static failed(rs:number,msgkey=process.env.API_MSG_KEY,error="", rfc=""
        ,aavmn=process.env.AAVMN,aavmx=process.env.AAVMX,aauu=process.env.AAUU
        ,iavmn=process.env.IAVMN, iavmx=process.env.IAVMX, iauu=process.env.IAUU) {
      return new BaseResponse(rs, null, null,msgkey,error,rfc, aavmn, aavmx, aauu, iavmn, iavmx, iauu)
    }
  }

  export enum ApiResponses{
    Failed = 0,
    Success = 1,
    Exception = 2,
    InvalidRequest = 3,
    NoRecordFound = 4,
    PasswordNotMatched = 5,
    MobileVerificationRequired = 101,
    TokenInvalid = 102,
    MobileNoRequired = 103,
    OtpVerificationRequired = 104,
    InvalidReferCode = 105,
    MobileNoAlreadyExists = 106,
    InvalidOtp = 107,
    AlreadyVerified = 108,
    LevelNoIsRequired = 109,
    InvalidEmail = 110,
    EmailAlreadyExists = 111,
    MustBe18 = 112,
    StateNotAllowed = 113,
    FinalConfirmationRequired = 114,
    AlreadyConfirmed = 115,
    AccountSuspended = 119,
    AccountDeleted = 120,
    UnAuthorizedUser = 121,
    ContestAmountInvalid = 201,
    ContestTeamInvalid = 202,
    AlreadyJoined = 203,
    NoMoreTeamJoinAllow = 204,
    CanNotJoinWithOtherUser = 205,
    AccontNoNotMatched = 206,
    AlreadyUploaded = 207,
    BankAccountAlreadyExists = 208,
    InvalidContestSize = 401,
    InvalidWinningAmount = 402,
    InsufficientBalance = 501,
    UserNotExist = 502,
    AlreadyCashfreeOrderUpdated = 503,
    AmountMissmatch = 504,
    AmountIsGreaterThanBalance = 505,
    AmountWithdrawalRequestSuccessfully = 506,
    RequestForWithdrawalNotAccepted = 507,
    AmountShouldBeGreater = 508,
    InvalidAmount = 509,
    MinimumTransferAmount = 510,
    TodayNoOfTransactionExceed = 511,
    DirectTransferToBank = 512,
    OtpSent = 116,
    ContestFull = 209,
    MatchStarted = 210,
    InvalidInviteCode =117,
    ReduceTeam= 118,
    MaxTeamPerUserExceed = 211,
    AlreadyRedeem = 601,
    ScrachCardExpired = 602,
    CanNotJoinedBothContest = 603,
    TodayPaytmWithdrawlLimitExceed = 518,
    KycRequired = 519,
    PandcardDetailsNotUploaded = 520,
    WalletAddressAssignToAnotherUser = 521,
    WalletAddressAlreadyUpdated = 522,
    TransactionFailed = 523,
    InvalidImageFormat = 122,
}