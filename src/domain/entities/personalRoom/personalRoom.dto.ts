import mongoose from 'mongoose'
import { PrivateBreakup } from '../contestRoom/contestRoom.dto';
export enum PersonalRoomState{
    CREATED = 1,
    ROOM_FULL = 2,
    GAME_START = 3,
    CANCELLED = 4
}

export interface PlayerData{
    id: string,
    name: string,
    referCode: string,
    mid: number
}

export interface PersonalRoom{
    _id: string,
    capacity: number,
    amount: number,
    createdBy: string,
    createdOn: number,
    players: Array<PlayerData>,
    state: PersonalRoomState,
    roomCode: string,
    gameId?: string,
    serverIp?: string,
    winningAmount?: number;
    uniqueId?: string,
    prizeBreakup?: Array<PrivateBreakup>,
    roomTimeoutMs?: number,
    isPrivate?: boolean,
    isOffline?: boolean
}

export enum PersonalRoomEvent {
    CREATE_ROOM = 'createRoom',
    JOIN_ROOM = 'joinRoom',
    LEAVE_ROOM = 'leaveRoom',
    GET_ROOM = 'getRoom',
    JOIN_GAME = 'joinGame',
    START_GAME = 'startGame',
    START_OFFLINE_GAME = 'startOfflineGame',
    PLAYER_JOIN = 'playerJoin',
    PLAYER_LEAVE = 'playerLeave',
    ROOM_TIMEOUT = 'roomTimeout',
    PRIZE_BREAKUP = 'prizeBreakup'
}

export interface PersonalContestData{
    WaitingTime: number,
    tt: number,
    total_winners: number,
    Duration: number,
    uniqueId: string,
    isPrivate: boolean,
    amt: number
}

export const personalRoomModel = new mongoose.Schema({
    players: {
        type: Array,
    },
    state: {
        type: Number,
        required: true,
        default : PersonalRoomState.CREATED
    },
    capacity : Number,
    amount : Number,
    createdBy: String,
    createdOn: Number,
    roomCode: String,
    gameId: String,
    serverIp: String,
    uniqueId: String
},{timestamps: true})

export interface GameWinningData {
    RoomCode: string,
    RoomId: number,
    ContestId: string,
    participantScores: Array<{UserId: string, Score: number}>,
    IsPrivate: boolean,
    IsOffline: boolean

}

export enum RoomStatus{
    Joined = 1,
    Completed = 2,
    Cancel = 3,
    Playing = 4
}