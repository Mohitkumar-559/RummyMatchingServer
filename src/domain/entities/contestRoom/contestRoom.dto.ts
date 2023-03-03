export enum ContestRoomEvent {
    SUB_TO_CONTEST = 'subToContest',
    PRESENCE = 'presence',
    NO_OPPONENT_FOUND = 'noOpponentFound',
    SERVER_TIME = 'serverTime',
    CHECK_SUBSCRIPTION = 'checkSubcription',
    CONTEST_COUTER = 'contestCounter'
}

export enum ContestRoomState {
    ACCEPT_JOINING = 1,
    PRESENCE_ACCEPTING = 2,
    GAME_START = 3
}

export interface ContestRoomData {
    _id: string
    contestId: string,
    timeSlot: number, // When player joining starts in contest
    startTime: number, // When game start for players
    state: number,
    capacity: number,
    matchMakingFunctionRun: number;
    timeRemaining?: number
}

export interface ContestData {
    cid: string,
    cn: string,
    fw: string,
    wa: number,
    ba: boolean,
    tt: number,
    cic:string,
    mea: boolean,
    mate: number,
    total_joined: number,
    cc: number,
    total_winners: string,
    mp: number,
    ja: number,
    catid: string,
    IsConfirm: boolean,
    isPrivate: boolean,
    currentDate:string,
    mba: number,
    jf: number,
    Duration: number,
    GameStartInSeconds: number,
    GameDelayInSeconds: number,
    TotalTimeInSeconds: number,
    IsStart: boolean,
    SortOrder:number,
    contest_msg: string,
    StartTime:number,
    WaitingTime:number,
    DelayTime:number,
    StartTimeDateTime:string,
    IsXFac: boolean,
    XFacLevel:number,
    Highmultiple: number,
    Lowmultiple: number,
    TurnTime: number,
    NoOfTurn: number,
    GameMode: number
}

export enum RoomType{
    CONTEST_ROOM = 1,
    PERSONAL_ROOM = 2
}

export interface GameTicketData {
    gameId: string,
    capacity: number,
    serverIp: string,
    playerPos: number,
    contestId?: string,     
    timeSlot?: number,      // For contest room
    gameServerTimeoutIn: number,
    gamePlayTime?: number,
    joiningAmount?: number,  // For personal room
    isPrivate?: boolean,
    uniqueId?: string,       // For contest room
    metaData?: any

}

export class Category
{
    catid:number;
    cn:string;
    cm:string;
    tc:number;
    isprac:boolean;
}
export class Breakup{
    wf:number;
    wt:number;
    wa:number;
}


export class PrivateBreakup{
    wf:number;
    wt:number;
    wa:number;
}
export interface TimerRequest{
    functionName: string
    data: any,
    timeout: number
}

export enum GamePriority{
    USER_FIRST = 1,
    XFAC_FIRST = 2,
    XFAC_OFF = 3
}

export enum TimeTrendLevel {
    LOW = 1,
    AVG = 2,
    HIGH = 3
}
export enum GameMode{
    TIME_BASED = 1,
    TURN_BASED = 2
}