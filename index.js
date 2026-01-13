const express = require('express');
const authDbConnection = require('./src/config/db');
const morgan = require('morgan');
const app =  express();
require('dotenv').config();



const routes = require('./src/routes/auth.route');
const wallets = require('./src/routes/wallet.route');
const PORT  = process.env.PORT || 3000;



app.use(express.json());
app.use(morgan('dev'));


authDbConnection();


app.get('/' , (req , res) =>{
    res.send("Welcome to Auth and Authorization System");
})

app.use('/api/users', routes);
app.use('/api/wallets', wallets);



app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`); 
});
