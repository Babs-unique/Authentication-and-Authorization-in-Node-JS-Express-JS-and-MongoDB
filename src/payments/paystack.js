const axios = require('axios');
const User = require('../models/auth.models');


const paystackInitiatePayment = async (req, res) => {
    const { amount, redirectUrl, accountNumber, currency } = req.body;
    const { userId } = req.user;

    if(!userId){
        return res.status(400).json({message : "User not found"});
    }
    if(!amount || !redirectUrl || !currency || !accountNumber){
        return res.status(400).json({message : "All fields are required"});
    }
    try {
        const user = await User.findById(userId);
        if(!user){
            return res.status(400).json({message : "User does not exist"});
        }
        const txRef = `PSK-${Date.now()} - ${userId}`;
        const moneyInKobo = Math.round(amount * 100);

        const payload = {
            email: user.email,
            amount: amountInKobo,
            reference: reference,
            callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
            metadata: {
                userId: userId,
                custom_fields: [
                {
                    display_name: "Customer Name",
                    variable_name: "customer_name",
                    value: user.name,
                },
                ],
    },
        }
        const response = await axios.post(
            "https://api.paystack.co/transaction/initialize",
            payload,
        {
            headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
            },
        }
        )
        if(response.data.status){
            return res.status(200).json({
                message: "Payment initialized successfully",
                authorizationUrl: response.data.data.authorization_url,
                accessCode: response.data.data.access_code,
                reference: reference,
            })}else{
                return res.status(400).json({
                    message: "Payment initialization failed",
                    error: response.data.message
                });
            }
    } catch (error) {
        console.error("Error in paystackInitiatePayment:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}
const paystackVerifyPayment = async (req, res) => {
    const { reference } = req.query;
    if(!reference){
        return res.status(400).json({message: "Reference is required"});
    }
    try{
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    "Content-Type": "application/json",
                }
            }
        )
        const {data} = response.data;
        if(data.status === "success"){
            return res.status(200).json({
                message: "Payment verified successfully",
            })
        }else{
            return res.status(400).json({
                message: "Payment verification failed"
            })
        }
    }catch (error) {
        console.error("Error in paystackVerifyPayment:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}

module.exports = { paystackInitiatePayment, paystackVerifyPayment };