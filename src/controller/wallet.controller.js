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

const getAllWallets = async (req , res) => {
    try {
        const {userId} = req.user;
        if(!userId){
            return res.status(400).json({message : "User not found"});
        }
        const wallets = await Wallet.find().populate(
            'userId' 
            , 'email');
        return res.status(200).json({wallets});
    } catch (error) {
        console.error("Error in getAllWallets:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}
const transferFunds = async (req , res) => {
    const {accountFrom , accountTo , amount} = req.body;
    const {userId} = req.user;
    if(!userId){
        return res.status(400).json({Message: "User not logged in/ found"});
    }
    if(!accountFrom || !accountTo || !amount){
        return res.status(400).json({Message: "All fields are required"});
    }
    if(accountFrom === accountTo){
        return res.status(400).json({Message: "Cannot transfer to the same account"});
    }
    if(amount <= 0){
        return res.status(400).json({Message: "Amount must be greater than zero"});
    }
    try{
        const senderWallet = await Wallet.findOne({accountNumber : accountFrom });
        const receiverWallet = await Wallet.findOne({accountNumber : accountTo });
        if(!senderWallet){
            return res.status(404).json({Message: "Sender wallet not found"});
        }
        if(!receiverWallet){
            return res.status(404).json({Message: "Receiver wallet not found"});
        }
        if(senderWallet.balance < amount){
            return res.status(400).json({Message: "Insufficient funds"});
        }
        const debitWallet = await Wallet.findOneAndUpdate(
            {accountNumber : accountFrom},
            {$inc : {balance : -amount}},
            {new : true}
        )

        const creditWallet = await Wallet.findOneAndUpdate(
            {accountNumber : accountTo},
            {$inc : {balance : amount}},
            {new : true}
        )
        if(!debitWallet ){
            return res.status(500).json({Message: "Error debiting sender's wallet"});
        }
        if(!creditWallet){
            return res.status(500).json({Message: "Error crediting receiver's wallet"});
        }

        return res.status(200).json({Message: "Transfer successful",
        detail : {
            from : accountFrom,
            to : accountTo,
            amountTransferred : amount
        }
        })

    }catch (error) {
        console.error("Error in transferFunds:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }
}


module.exports = {
    createWallet,
    getAllWallets,
    transferFunds
}