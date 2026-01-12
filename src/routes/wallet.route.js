const express = require('express');
const myAuth = require('../config/auth');
const { createWallet } = require('../controller/wallet.controller');
const

const walletRouter = express.Router();


walletRouter.post('/create-wallet' ,myAuth , createWallet);