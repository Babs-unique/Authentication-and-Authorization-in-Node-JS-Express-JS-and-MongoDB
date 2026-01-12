const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId :{
        type : mongoose.Schema.Types.ObjectId,
        ref : 'wallet',
        required : true
    },
    transactionType : {
        type : String,
        enum : ['credit' , 'debit'],
        required : true
    },
    walletId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'wallet',
        required : true
    },
    status : {
        type : String,
        enum : ['pending' , 'completed' , 'failed'],
        required : true
    },
    balanceBefore : {
        type : mongoose.Schema.Types.Decimal128,
        required : true
    },
    balanceAfter : {
        type : mongoose.Schema.Types.Decimal128,
        required : true
    },
    reference : {
        type : String,
        required : true
    }
},{
    versionKey: false,
    timestamps: true
})


const transaction = mongoose.model('transaction' , transactionSchema);

module.exports = transaction;