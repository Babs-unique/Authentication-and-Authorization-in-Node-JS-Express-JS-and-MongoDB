const express = require('express');
const myAuth = require('../config/auth');
const { createWallet, getAllWallets, transferFunds } = require('../controller/wallet.controller');
const { redirectUrl } = require('../payments/flutterwave');
const { paystackInitiatePayment } = require('../payments/paystack');


const walletRouter = express.Router();


walletRouter.post('/create-wallet' ,myAuth , createWallet);
walletRouter.get('/all-wallets' , myAuth , getAllWallets);
walletRouter.post('/transfer-funds' , myAuth , transferFunds);
walletRouter.post('/flutterwave-payment' , myAuth , redirectUrl);
walletRouter.get('/paystack-payment' , myAuth, paystackInitiatePayment );

module.exports = walletRouter;