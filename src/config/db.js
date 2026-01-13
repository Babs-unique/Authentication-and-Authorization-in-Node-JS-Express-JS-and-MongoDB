const mongoose = require('mongoose');

const authDbConnection = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("Connected to Database successfully");
    } catch (error) {
        console.error("Database connection error:", error);
        process.exit(1);
    }
}


module.exports = authDbConnection;