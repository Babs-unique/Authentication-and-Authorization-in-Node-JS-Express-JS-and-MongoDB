const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    file : (req, file, cb) => {
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff', '.svg','.mp4', '.mov', '.avi', '.pdf', '.docx']

        const ext = path.extname(file.originalname);

        if(allowedExtensions.includes(ext.toLowerCase())){
            cb(null,true);
        }else{
            cb(new Error('File type not allowed'), false);
        }
    }
})


const upload = multer({ storage});

module.exports = upload;