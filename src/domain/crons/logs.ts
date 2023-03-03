import CronJob from "node-cron";
import fs from 'fs';
import path from "path";
import { BlobServiceClient } from "@azure/storage-blob";

export async function scheduledFunction() {
    // Cron job 
    let cronTime = process.env.CRON_TIME;
    if(!cronTime){
        throw new Error("No cron job time set");
    }
    console.log('Cron job initialised=>', cronTime);
    const scheduledJobFunction = CronJob.schedule(cronTime, () => {
        try {
            console.log('Cron job started')
            let dir = path.join("", "logs")
            fs.readdir(dir, function (err, files) {
                files.forEach(function (file) {

                    let foldername = './logs/' + file;

                    let date = new Date();
                    date.setDate(date.getDay() - 3)
                    fs.stat(foldername, function (err, stats) {
                        let fileDate = stats.mtime;
                        if (date > fileDate) {
                            uploadFile(file)
                            // delete file
                            fs.unlink(foldername, function (err) {
                                // if no error, file has been deleted successfully
                                console.log('File deleted!', file);
                            });
                        }

                    })
                })
            })

        } catch (err) {
            console.error('Error in CRON JOB=>', err);
        }
    });

    scheduledJobFunction.start();
}

// upload file in azure
let connectionString = process.env.CONNECTION_STRING;
async function uploadFile(file: string) {
    //get connection string
    if (!connectionString) {
        return false;
    }
    const blobServiceClient = await BlobServiceClient.fromConnectionString(connectionString);
    const containerName = blobServiceClient.getContainerClient(process.env.CONTAINER);
    console.log('\t', containerName.containerName);
    // Get a reference to a container
    const containerClient = await blobServiceClient.getContainerClient(containerName.containerName);
    const blobName = file + ".txt";
    console.log(blobName);

    // Get a block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    console.log('\nUploading to Azure storage as blob:\n\t', blobName);
    const data = file;
    const uploadBlobResponse = await blockBlobClient.upload(data, data.length);
    console.log("Blob was uploaded successfully. requestId: ", uploadBlobResponse.requestId);
}