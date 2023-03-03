import { personalRoomModel } from 'domain/entities/personalRoom/personalRoom.dto';
import mongoose from 'mongoose'

export class MongoDb {
    private mongoClient: typeof mongoose;
    public constructor() {
        this.setupConnection();
    }

    private async setupConnection(){
        const options = {
            autoIndex: false, // Don't build indexes
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
            family: 4 // Use IPv4, skip trying IPv6
          }
      
          this.mongoClient = await mongoose.connect(process.env.MONGO_URL, options)
          this.mongoClient.set('debug', true);
          console.log('connected to Mongo-db')
    }

    get INSTANCE() {
        return this.mongoClient
    }
    public get personalRoomMode(){
        return this.mongoClient.model<mongoose.Document>('PersonalLudoRoom', personalRoomModel)
    }
}