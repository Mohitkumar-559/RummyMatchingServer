import { IUser } from "domain/entities/users/user.dto";
import { Log } from "middleware/logger";
import { Socket } from "socket.io";
import UserService from "./user.service";

class UserController {
    private _service: UserService;

    public constructor() {
        this._service = UserService.Instance;
    }

    async pingPong(socket: Socket, body: any, callback: any) {
        callback({
            ts: Date.now()
        })
    }

    async onDisconnect(socket: Socket, comeFrom: string, reason: any){
        const user: IUser = <IUser>socket.data
        Log('disconnection', `${user.name} disconnected from ${comeFrom}`, reason);
    }

    async onDisconnecting(socket: Socket, comeFrom: string, reason: any){
        const user: IUser = <IUser>socket.data
        Log('disconnection', `${user.name} disconnecting from ${comeFrom}`, reason);
    }

}

export default UserController;