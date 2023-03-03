export interface MegaContestRoomData {
    _id: string
    contestId: string,
    joinTime: number, // When player joining starts in contest
    gameStartTime: number, // When game start for players
    state: number,
    capacity: number,
    noOfRounds: number,
    gameTimeInMs: number,
    currentRound: number,
    nextRoundTime: number,
    maxUser: number
}

export enum MegaContestEvent {
    SUB_TO_CONTEST = 'subToTournament',
    PRESENCE = 'presenceTournament',
    NO_OPPONENT_FOUND = 'noOpponentFound',
    CONTEST_COUTER = 'tournamentCounter'
}

export interface MegaContestData {
    cid: string,
    cn: string,
    fw: number,
    wa: number,
    ba: boolean,
    tt: number,
    cic:string,
    mea: boolean,
    mate: number,
    total_joined: number,
    cc: number,
    total_winners: number,
    mp: number,
    ja: number,
    catid: number,
    IsConfirm: boolean,
    isPrivate: boolean,
    currentDate:string,
    contest_msg: string,
    mba: number,
    jf: number,
    Duration: number,
    GameStartInSeconds: number,
    GameDelayInSeconds: number,
    StartTimeDateTime:string,
    TotalTimeInSeconds: number,
    IsStart: boolean,
    SortOrder:number,
    StartTime:number,
    WaitingTime:number,
    DelayTime:number,
    IsXFac: boolean,
    XFacLevel:number,
    Highmultiple: number,
    Lowmultiple: number,
    TurnTime: number,
    NoOfTurn: number,
    GameMode: number,
    NoOfRound: number,
    TotalMatches: number,
    contestStart: number,
    GameStartTime: number,
    MaxUsers: number,
    isTournamentContest: boolean
}

export enum MegaContestRoomState {
    ACCEPT_JOINING = 1,
    PRESTARTING_CONFIG = 2,
    GAME_START = 3,
    CANCELLED = 4
}

export interface MegaGameTicketData {
    gameId: string,
    capacity: number,
    serverIp: string,
    playerPos: number,
    contestId?: string,     
    timeSlot?: number,      // For contest room
    gameServerTimeoutIn: number,
    gamePlayTime?: number,
    round: number,
    joiningAmount?: number,  // For personal room
    uniqueId?: string,       // For contest room
    metaData?: any

}