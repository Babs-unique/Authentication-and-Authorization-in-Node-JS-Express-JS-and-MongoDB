const Auth = require('../models/auth.models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sendEmail = require('../../utils/email');
const cloudinary = require('cloudinary').v2;

const signUp = async (req ,res) =>{
    const {email , password , name} = req.body;

    try {
        if(!email || !password || !name){
            return res.status(400).json({message : "All fields are required"});
        }
        const existingUser = await Auth.findOne({email});

        if(existingUser){
            return res.status(400).json({message : "User already exists"});
        }

        const token  = jwt.sign({userId : Auth._id} , process.env.JWT_SECRET , 
        {expiresIn : '1h'});
        const hashedPassword = await bcrypt.hash(password , 10);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); 

        const newUser  = new Auth({
            name,
            email,
            password: hashedPassword,
            otp,
            otpExpiry
        });

        await newUser.save();

        await sendEmail(
            email,
            "Verify your account",
            `Account Created successfully. Your OTP is ${otp}. It is valid for 10 minutes.`
        )
        return res.status(201).json({message : "User created Successfully"});
        
    } catch (error) {
        console.error("Error in signUp:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}

const login = async (req , res) => {
    const {email , password} = req.body;

    try {
        if(!email || !password){
            return res.status(400).json({message : "All fields are required"});
        }
        const existingUser = await Auth.findOne({email});

        if(!existingUser){
            return res.status(400).json({message : "User does not exist"});
        }
        if (!existingUser.isVerified){
            return res.status(400).json({message : "User is not verified"});
        }
        const isPassword = await bcrypt.compare(password , existingUser.password);

        if(!isPassword){
            return res.status(400).json({message : "Invalid Credentials"});
        }
        

        await sendEmail(
            email,
            "Login Successful",
            `You have successfully logged in to your account.`
        )
        return res.status(200).json({message : "Login Successful"});
    } catch (error) {
        console.error("Error in login:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}

const forgetPassword = async (req , res) => {
    const {email} = req.body;
    try {
        if(!email){
            return res.status(400).json({message : "Email is required"});
        }

        const user = await Auth.findOne({email});
        if(!user){
            return res.status(400).json({message : "User does not exist"});
        }
        const otp = Math.floor(100000 + Math.random() * 900000);
        user.otp = otp;
        await user.save();
        return res.status(200).json({message : "OTP sent successfully"});
    } catch (error) {
        console.error("Error in forgetPassword:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}
const resetPassword = async (req, res) => {
    const {otp , password} = req.body;
    if(!otp || !password){
        return res.status(400).json({message : "All fields are required"});
    }
    const user = await Auth.findOne({otp});
    if(!user){
        return res.status(400).json({message : "Invalid OTP"});
    }
    const hashedPassword = await bcrypt.hash(password , 10);
    user.password = hashedPassword;
    user.otp = null;
    await user.save();
    return res.status ( 200).json({message : "Password reset successful"});
}
const verifyOtp = async (req ,  res) =>{
    const {otp} = req.body;
    try {
    if(!otp){
        return res.status(400).json({message : "OTP is required"});
    }
    const user = await Auth.findOne({otp});
    if(!user){
        return res.status(400).json({message : "Invalid OTP"});
    }
    if(user.otpExpiry < Date.now()){
        return res.status(400).json({message : "OTP has expired"});
    }
    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();
    return res.status(200).json({message : "User verified successfully"});
    } catch (error) {
        console.error("Error in verifyOtp:", error);
        return res.status(500).json({message : "Internal Server Error"});
}
}
const resendOtp = async (req, res) =>{
    const {email} = req.body; 
    try {
        if(!email){
            return res.status(400).json({message : "Email is required"});
        }
        const user = await Auth.findOne({email})
        if(!user) {
            return res.status(400).json({message : "User does not exist"});
        }
        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpExpiry = new Date.now() + 10 * 60 * 1000;

        user.otp = otp;
        user.otpExpiry = otpExpiry;

        await user.save();

        await sendEmail(
            email,
            "OTP Resend",
            `Your OTP ${otp} is valid for 10 minutes.`
    )
        return res.status(200).json({message : "OTP resent successfully"});
    } catch (error) {
        console.error("Error in sending Otp:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}

const getAllUsers = async (req , res) => {
    const {userId}  = req.user;
    try {
        const admin = await Auth.findById(userId);
        if(admin.role !== 'admin'){
            return res.status(403).json({message : "Access denied"});
        }
        const users = await Auth.find().select('-password -otp -otpExpiry');

        return res.status(200).json({users});
    } catch (error) {
        console.error("Error in getAllUsers:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }

}
const uploadImage = async (req, res) => {
    const { userId} = req.user;
    if(!userId){
        return res.status(400).json({message : "User not logged in"});
    }
    try {
        if(!req.file){
            return res.status(400).json({message : "No file uploaded"});
        }
        const user = await Auth.find(userId);
        if(!user){
            return res.status(400).json({message : "User not found"});
        }

        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
            folder: 'user_profiles',
            public_id: `user_${userId}`,
        })

        user.profileImage = uploadResult.secure_url;

        await user.save()
        return res.status(200) .json({Message : " Image Uploaded Successfully"});
    } catch (error) {
        console.error("Error in uploadImage:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}

module.exports = {
    signUp,
    login,
    forgetPassword,
    resetPassword,
    verifyOtp,
    resendOtp,
    getAllUsers,
    uploadImage
}
