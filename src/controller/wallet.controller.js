const Wallet = require('../models/wallet.models');
const Transaction = require('../models/transactions.models');


const createWallet = async (req, res) => {
    try {
        const {userId} = req.user;
        const {phoneNumber, currency} = req.body;
        if(!userId){
            return res.status(400).json({message : "User not found"});
        }
        const existingWallet = await Wallet.findOne({userId});
        if(!existingWallet){
            return res.status(400).json({message : "Wallet already exists for this user"});
        }
        if(!phoneNumber || !currency){
            return res.status(400).json({message : "All fields are required"});
        }
            const formattedPhoneNumber = phoneNumber.replace(/^(\+234|0)/, '');
            const newWallet = new Wallet({
                userId: userId,
                balance: 0.00,
                currency,
                accountNumber: formattedPhoneNumber
            });

            await newWallet.save();

            return res.status(201).json({message : "Wallet created successfully", wallet : newWallet});
    } catch (error) {
        console.error("Error in createWallet:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}


module.exports = {
    createWallet
}