const Flutterwave = require("flutterwave-node-v3");
const User = require('../models/auth.models');
const axios = require('axios');
const Transaction = require('../models/transactions.models');
const Wallet = require('../models/wallet.models');
const redirectUrl = async (req, res) =>{
    const {userId} = req.user;
    const {amount , redirectUrl,currency , accountNumber} = req.body
    if(!userId){
        return res.status(400).json({message : "User not found"});
    }
    if(!amount || !redirectUrl || !currency){
        return res.status(400).json({message : "All fields are required"});
    }
    try {
        const user = User.findById(userId);
        if(!user){
            return res.status(400).json({message : "User does not exist"});
        }

        const txnRef = `TX-${Date.now()} - ${userId}`;

        const flw = new Flutterwave(
            process.env.FLW_PUBLIC_KEY,
            process.env.FLW_SECRET_KEY
        )
        const response = await axios.post(
		'https://api.flutterwave.com/v3/payments',
		{
			tx_ref: txnRef,
			amount: amount,
			currency: currency,
			redirect_url: redirectUrl,
			customer: {
				email: user.email,
				name: user.name,
				phoneNumber:user.phoneNumbeR,
			},
			customizations: {
				title: 'Flutterwave Standard Payment',
			},
		},
		{
			headers: {
				Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
				'Content-Type': 'application/json',
			},
		}
	);
    const wallet = await Wallet.findOne({accountNumber : accountNumber})

    const newTransaction = new Transaction({
        userId: mongoose.Types.ObjectId(userId),
        walletId: mongoose.Types.ObjectId(wallet._id),
        referenceNumber: txRef,
        type: "credit",
        amount: amount,
        currency: currency,
        balanceBefore: wallet.balance,
        balanceAfter: parseFloat(wallet.balance) + parseFloat(amount),
        description: "Wallet funding via Flutterwave",
        status: "pending",
    })
    console.log(response)

    await newTransaction.save();

    return res.status(200).json({message : "Redirecting to payment", paymentLink : response.data.data.link});

    } catch (error) {
        console.error("Error in redirectUrl:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }

}



module.exports = {redirectUrl};