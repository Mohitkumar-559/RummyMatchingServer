import { Request } from 'express'
import { Socket } from 'socket.io'
import { GameTicketData } from '../contestRoom/contestRoom.dto'
export interface IUser {
  _id: string
  userId : string,
  name: string
  did: string
  token : string
  createdAt: Date
  assignedServer?: string,
  mid?: number,
  socket?: Socket,
  referCode?: string
}

export interface IUserRequest extends Request {
    profile?: IUser;
}

export interface RunningContestData {
  contestId: string,
  timeSlot: number,
  ticketAssigned: boolean,
  ticketData: GameTicketData
}


export enum UserEvent{
    PING_PONG = 'pingPong',
    DISCONNECT = 'disconnect',
    DISCONNECTING = 'disconnecting'
}

export interface JoinQueueData{
  ticket: GameTicketData,
  user: IUser
}