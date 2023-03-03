export class RedisKeys {
    // static NODE_ENV = 'ludov2'

    static get NODE_ENV() {
        return process.env.NODE_ENV;
    }

    public static getENVType() {
        if (process.env.IS_PROD == 'true') {
            return 'prod_'
        }
        return 'qa_';
    }

    public static getProfileKey(profileId: string) {
        return `{${profileId}}_profile_data_${this.NODE_ENV}`
    }

    public static getContestDetailKey(contestId: string) {
        return `{${contestId}}_contest_detail_${this.NODE_ENV}`
    }

    public static ContestCategorization(gameId: string) {
        return `${this.NODE_ENV}_Contest:Categorization:Game:${gameId}`
    }

    public static ContestDetails(gameId: string) {
        return `${this.NODE_ENV}_Contest:ContestDetails:${gameId}`
    }

    public static PracticeContestUser(userId: string) {
        return `${this.NODE_ENV}_PracticeContestUser:${userId}`
    }

    public static GiveawayUserContest(userId: string) {
        return `${this.NODE_ENV}_GiveawayContestUser:${userId}`
    }

    public static ContestPrizeBreakUp(contestId: string) {
        return `${this.NODE_ENV}_Contest:PriceBreakup:Contest:${contestId}`
    }

    public static MegaContestPrizeBreakUp(contestId: string) {
        return `${this.NODE_ENV}_MegaContest:PriceBreakup:Contest:${contestId}`
    }

    public static JoinedContestCount(gameId: string) {
        return `${this.NODE_ENV}_JoinedContestCount:${gameId}`
    }

    public static AppGameSetting() {
        return `${this.NODE_ENV}_AppGameSetting:getappgamesetting`
    }

    public static getContestRoomKey(contestId: string, timeSlot: number) {
        return `${this.NODE_ENV}_ContestRooms:${contestId}-${timeSlot}`
    }

    public static getMegaContestRoomKey(contestId: string, timeSlot: number) {
        return `${this.NODE_ENV}_MegaContestRooms:${contestId}-${timeSlot}`
    }

    public static getContestRoomJoineduser(contestId: string, timeSlot: number) {
        return `${this.NODE_ENV}_JoinedUser:${contestId}-${timeSlot}`
    }

    public static getMegaContestRoomJoineduser(contestId: string, timeSlot: number) {
        return `${this.NODE_ENV}_MegaJoinedUser:${contestId}-${timeSlot}`
    }

    public static getContestRoomActiveuser(contestId: string, timeSlot: number) {
        return `${this.NODE_ENV}_ActiveUser:${contestId}-${timeSlot}`
    }

    public static contestRoomCounter() {
        return `${this.NODE_ENV}_ContestRoomCounters`
    }

    public static megaContestRoomCounter() {
        return `${this.NODE_ENV}_MegaContestRoomCounters`
    }

    public static getContestTicketQueue(contestId: string, timeSlot: number) {
        return `${this.NODE_ENV}_ticketQueue:${contestId}-${timeSlot}`
    }

    public static getUserSpecificTicketQueue(contestId: string, timeSlot: number) {
        return `${this.NODE_ENV}_userTicketQueue:${contestId}-${timeSlot}`
    }

    public static getMegaContestTicketQueue(contestId: string, timeSlot: number, round: number) {
        return `${this.NODE_ENV}_megaTicketQueue:${contestId}-${timeSlot}-${round}`
    }

    public static getMegaUserSpecificTicketQueue(contestId: string, timeSlot: number, round: number) {
        return `${this.NODE_ENV}_megaUserTicketQueue:${contestId}-${timeSlot}-${round}`
    }

    public static getRunningContest(userId: string) {
        return `${this.NODE_ENV}:runningContestData:${userId}`
    }

    public static getRabbitMqMsgKey(msgId: string) {
        return `${this.NODE_ENV}:rabbitMqMsg:${msgId}`
    }

    public static getPersonalRoomKey(roomId: string) {
        return `${this.NODE_ENV}:PersonalRoom:${roomId}`
    }

    public static getUserPersonalRoomKey(userId: string) {
        return `${this.NODE_ENV}:UserPersonalRoom:${userId}`
    }

    public static PriorityTimeFrame(gameId: string) {
        return `${this.NODE_ENV}:PriorityTimeFrame:${gameId}`
    }

    public static PriorityTimeFrameV2(gameId: string, cid: string) {
        return `${this.NODE_ENV}:PriorityTimeFrame:${gameId}:${cid}`
    }

    public static ContestHourlyTrend(gameId: string) {
        return `${this.NODE_ENV}:ContestHourlyTrend:${gameId}`
    }

    public static LudoJoiningStatus() {
        return `${this.NODE_ENV}:JoiningEnable`
    }
    public static LudoTesters() {
        return `${this.NODE_ENV}:TesterAccount`
    }

    public static BlockedUser() {
        return `prod_BlockedUser`
    }

    public static PresetUser() {
        return `${this.getENVType()}XFacCustomer`
    }

    public static PresetUserContest() {
        return `${this.getENVType()}PresetUserContest`
    }

    public static noOpponentCounter() {
        return `${this.NODE_ENV}:noOpponentCounter`
    }

    public static roundWinners(round: number, contestId: string, gameStartTime: number) {
        return `${this.NODE_ENV}:megaContestRoundWinners:${contestId}-${gameStartTime}-${round}`
    }

    public static megaContest() {
        return `${this.getENVType()}tournament_Contest:ContestDetails:1`
    }
}