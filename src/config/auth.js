const jwt  = require('jsonwebtoken');


const myAuth = async(req ,res ,next) =>{
    const header = req.headers.authorization;

    if(!header || !header.startsWith('Bearer ')){
        return res.status(401).json({message : "Unauthorized"});
    }

    const token = header.split(' ')[1];

    try {
        const decoded = await jwt.verify(token , process.env.JWT_SECRET);
        next();
    } catch (error) {
        console.error("Authentication error:", error);
        return res.status(401).json({message : "Invalid Token"});
    }
}


module.exports = myAuth;