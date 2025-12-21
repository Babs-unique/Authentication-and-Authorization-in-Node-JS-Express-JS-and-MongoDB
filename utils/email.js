const nodemailer = require('nodemailer');
const ejs  = require('ejs');
const path = require('path');


const transporter = nodemailer.createTransport({
    service: 'Gmail',
    host: PROCESS.ENV.EMAIL_HOST,
    port: PROCESS.ENV.EMAIL_PORT,
    auth:{
        user : PROCESS.ENV.EMAIL_USER,
        pass : PROCESS.ENV.EMAIL_PASS
    }
})


const sendEmail = async (to, subject,text) =>{

    const html = await ejs.renderFile(path.join(__dirname,'../views/emailTemplate.ejs'), 
    {
        title : subject,
        message : text
    }
    );
    const mailOptions = {
        from : PROCESS.ENV.EMAIL_USER,
        to,
        subject,
        text
    }
    await transporter.sendMail(mailOptions);
}



module.exports = sendEmail;