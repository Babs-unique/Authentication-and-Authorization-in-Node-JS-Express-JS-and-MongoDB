const mongoose = require('mongoose');


const authSchema = new mongoose.Schema({
    name : {
        type: String,
        required: true
    },
    email : {
        type: String,
        required : true,
        unique : true
    },
    password : {
        type: String,
        required :  true,
    },
    username : { 
        type: String,
        unique : true,
    },
    otp : {
        type: String,
    },
    otpExpiry : {
        type: Date,
    },
    isVerified : {
        type : Boolean,
        default :  false,
    },
    role : {
        enum : ['user' , 'admin'], 
        type : String,
        default : 'user'
    }
},
        {versionKey: false,
        timestamps: true
    });



const auth = mongoose.model('auth' , authSchema);


module.exports = auth;