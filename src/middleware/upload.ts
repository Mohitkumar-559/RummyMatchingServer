import multer from 'multer';
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/')
    },
    
    filename: function (req: any, file: any, cb: any) {
        cb(null, file.originalname)
    }
});

const fileFilter = (req: any,file: any,cb: any) => {
    if(true){
     
    cb(null, true);
   }else{
      cb(new Error("Image uploaded is not of type jpg/jpeg or png"),false);
}
}
const upload = multer({storage: storage, fileFilter : fileFilter});
export default upload;