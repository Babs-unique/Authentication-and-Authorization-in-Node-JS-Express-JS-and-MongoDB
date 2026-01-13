const express = require('express');
const myAuth = require('../config/auth');
const { createWallet, getAllWallets } = require('../controller/wallet.controller');


const walletRouter = express.Router();


walletRouter.post('/create-wallet' ,myAuth , createWallet);
walletRouter.get('/all-wallets' , myAuth , getAllWallets);


module.exports = walletRouter;