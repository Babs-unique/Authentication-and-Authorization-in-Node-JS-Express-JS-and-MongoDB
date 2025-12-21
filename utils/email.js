const nodemailer = require('nodemailer');
const ejs  = require('ejs');
const path = require('path');


const transporter = nodemailer.createTransport({
    service: 'Gmail',
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth:{
        user : process.env.EMAIL_USER,
        pass : process.env.EMAIL_PASS
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