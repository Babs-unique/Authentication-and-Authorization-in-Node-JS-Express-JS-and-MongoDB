const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'auth',
        required: true
    },
    currency: {
        type: String,
        required: true,
        default: 'NGN'
    },
    balance: {
        type: mongoose.Schema.Types.Decimal128,
        default: 0.00
    },
    accountNumber: {
        type: String,
        required: true,
        unique: true
    }},
    {
        versionKey: false,
        timestamps: true
    }
);

const Wallet = mongoose.model('wallet', walletSchema);

module.exports = Wallet;