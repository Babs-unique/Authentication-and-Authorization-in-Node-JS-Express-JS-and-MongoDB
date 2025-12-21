const express = require('express');
const router = express.Router();

const { signUp, login, resetPassword, forgetPassword, verifyOtp, resendOtp, getAllUsers } = require('../controller/auth.controller');
const myAuth = require('../config/auth');

router.post('/signUp', signUp);
router.post('/login' , login);
router.put('/reset-password' , resetPassword);
router.post('/forget-password' , forgetPassword);
router.put ('/verify-otp' , verifyOtp);
router.put('/resend-otp' , resendOtp);
router.get('/all-users' , myAuth , getAllUsers);


module.exports = router;