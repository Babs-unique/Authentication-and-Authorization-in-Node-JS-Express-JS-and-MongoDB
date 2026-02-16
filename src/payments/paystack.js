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
const paystackWebhook = async (req, res) => {
  try {
    const crypto = require("crypto");
    const secret = process.env.PAYSTACK_SECRET_KEY;

    // Verify webhook signature
    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.log("Invalid Paystack webhook signature");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const event = req.body;

    // Handle charge.success event
    if (event.event === "charge.success") {
      const { reference, amount, metadata } = event.data;

      // Extract userId from reference or metadata
      let userId;
      if (metadata?.userId) {
        userId = metadata.userId;
      } else {
        const refParts = reference.split("-");
        userId = refParts[refParts.length - 1];
      }

      // Convert amount from kobo to main currency
      const amountInNaira = amount / 100;

      // Find user's wallet and credit it
      const wallet = await Wallet.findOne({ userId: userId });

      if (wallet) {
        await Wallet.findOneAndUpdate(
          { userId: userId },
          { $inc: { balance: amountInNaira } },
          { new: true }
        );

        const user = await User.findById(userId);
        if (user) {
          console.log(`Wallet funded via Paystack webhook for user: ${user.email}, Amount: ${amountInNaira} NGN`);
        }

        return res.status(200).json({ message: "Wallet funded successfully" });
      } else {
        console.error("Wallet not found for userId:", userId);
        return res.status(404).json({ message: "Wallet not found" });
      }
    }

    // Acknowledge other events
    return res.status(200).json({ message: "Webhook received" });
  } catch (e) {
    console.error("Paystack webhook error:", e);
    return res.status(500).json({ message: "Webhook processing failed" });
  }
};


module.exports = { paystackInitiatePayment, paystackVerifyPayment, paystackWebhook };