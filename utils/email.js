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


const sendEmail = async (to, subject, text) => {
    try {
        const templatePath = path.resolve(__dirname, '..', 'views', 'emailTemplate.ejs');
        const html = await ejs.renderFile(templatePath, {
            title: subject,
            message: text,
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            text,
            html,
        };

        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('Error in sendEmail:', err);
        throw err;
    }
}




module.exports = sendEmail;