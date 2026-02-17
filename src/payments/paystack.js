// Import axios (tool to send messages to other servers)
const axios = require('axios');
// Import User model (where we store user information)
const User = require('../models/auth.models');

// ============ INITIATE PAYSTACK PAYMENT ============
// Function to create payment link and send user to Paystack
const paystackInitiatePayment = async (req, res) => {
    // Get payment information from the request body
    const { amount, redirectUrl, accountNumber, currency } = req.body;
    // Get the user's ID from the logged-in user
    const { userId } = req.user;

    // Check: Is userId missing? (User not logged in?)
    if(!userId){
        // Send error: User not found
        return res.status(400).json({message : "User not found"});
    }
    
    // Check: Are any required fields missing?
    if(!amount || !redirectUrl || !currency || !accountNumber){
        // Send error: All fields required
        return res.status(400).json({message : "All fields are required"});
    }
    
    // Try to run this code and catch any errors
    try {
        // Find the user from database using their ID
        const user = await User.findById(userId);
        // Check: Does user exist?
        if(!user){
            // Send error: User doesn't exist
            return res.status(400).json({message : "User does not exist"});
        }
        
        // Create a unique reference number for this transaction
        // Format: PSK-[time]-[userId]
        const txRef = `PSK-${Date.now()} - ${userId}`;
        // Convert amount to kobo (Paystack uses kobo, not naira)
        // 1 Naira = 100 Kobo, so multiply by 100
        const moneyInKobo = Math.round(amount * 100);

        // Create the payment request message for Paystack
        const payload = {
            // User's email address
            email: user.email,
            // Amount in kobo
            amount: moneyInKobo,
            // Our reference number for this transaction
            reference: txRef,
            // Where to send user after payment (or use default from .env)
            callback_url: redirectUrl || process.env.PAYSTACK_CALLBACK_URL,
            // Extra information about this payment
            metadata: {
                // Add user ID to metadata
                userId: userId,
                // Custom fields for Paystack
                custom_fields: [
                {
                    // Label shown on Paystack
                    display_name: "Customer Name",
                    // Variable name for custom field
                    variable_name: "customer_name",
                    // User's name as value
                    value: user.name,
                },
                ],
            },
        }
        
        // Send POST (message) to Paystack's API
        const response = await axios.post(
            // Paystack API endpoint for payment initialization
            "https://api.paystack.co/transaction/initialize",
            // Send the payload (payment information)
            payload,
            {
                // Headers = instructions for how to send this message
                headers: {
                    // Authorization: Secret key to prove we're allowed to use Paystack
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    // Content-Type: Tell them we're sending JSON format
                    "Content-Type": "application/json",
                },
            }
        )
        
        // Check: Was the payment initialization successful?
        if(response.data.status){
            // Yes! Send payment details to user
            return res.status(200).json({
                message: "Payment initialized successfully",
                // URL where user should go to pay
                authorizationUrl: response.data.data.authorization_url,
                // Access code for this payment
                accessCode: response.data.data.access_code,
                // Reference number for this transaction
                reference: txRef,
            });
        }else{
            // No! Something went wrong
            return res.status(400).json({
                message: "Payment initialization failed",
                // Show Paystack's error message
                error: response.data.message
            });
        }
    } catch (error) {
        // If any error happened, show it in console
        console.error("Error in paystackInitiatePayment:", error);
        // Send error message to user
        return res.status(500).json({message : "Internal Server Error"});
    }
}

// ============ VERIFY PAYSTACK PAYMENT ============
// Function to check if a payment was successful
const paystackVerifyPayment = async (req, res) => {
    // Get the reference number from the URL query (like ?reference=PSK-123)
    const { reference } = req.query;
    
    // Check: Is reference missing?
    if(!reference){
        // Send error: Reference required
        return res.status(400).json({message: "Reference is required"});
    }
    
    // Try to run this code and catch any errors
    try{
        // Send GET message to Paystack to verify the payment
        const response = await axios.get(
            // Paystack API endpoint to verify payment (using reference)
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                // Headers = instructions for sending message
                headers: {
                    // Authorization: Secret key to prove we're allowed
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    // Content-Type: We expect JSON back
                    "Content-Type": "application/json",
                }
            }
        )
        
        // Extract payment data from response
        const {data} = response.data;
        
        // Check: Did payment succeed?
        if(data.status === "success"){
            // Yes! Send success message
            return res.status(200).json({
                message: "Payment verified successfully",
            })
        }else{
            // No! Payment failed or pending
            return res.status(400).json({
                message: "Payment verification failed"
            })
        }
    }catch (error) {
        // If any error happened, show it in console
        console.error("Error in paystackVerifyPayment:", error);
        // Send error message to user
        return res.status(500).json({message : "Internal Server Error"});
    }
}

// ============ WEBHOOK: WHEN PAYSTACK SENDS PAYMENT CONFIRMATION ============
// This function is called when user successfully pays on Paystack
const paystackWebhook = async (req, res) => {
    // Try to run this code and catch any errors
    try {
        // Import crypto (security tool for signature verification)
        const crypto = require("crypto");
        // Get the secret key from .env file
        const secret = process.env.PAYSTACK_SECRET_KEY;

        // ===== STEP 1: VERIFY THE MESSAGE IS REALLY FROM PAYSTACK (SECURITY) =====
        // Create a fingerprint of the message using our secret key
        const hash = crypto
            // Use HMAC-SHA512 (security algorithm)
            .createHmac("sha512", secret)
            // Hash the message body
            .update(JSON.stringify(req.body))
            // Convert to hex format (like a code)
            .digest("hex");

        // Check: Does the fingerprint match Paystack's signature?
        if (hash !== req.headers["x-paystack-signature"]) {
            // No match = Fake message! Reject it!
            console.log("Invalid Paystack webhook signature");
            return res.status(401).json({ message: "Unauthorized" });
        }

        // ===== STEP 2: GET THE PAYMENT EVENT =====
        // Get the entire message body (payment information)
        const event = req.body;

        // ===== STEP 3: CHECK IF EVENT IS SUCCESSFUL PAYMENT =====
        // Check: Is this a successful charge event?
        if (event.event === "charge.success") {
            // ===== STEP 4: EXTRACT PAYMENT INFORMATION =====
            // Get reference, amount, and metadata from the event
            const { reference, amount, metadata } = event.data;

            // ===== STEP 5: FIND OUT WHICH USER THIS PAYMENT IS FOR =====
            // Variable to store user ID
            let userId;
            // Check Plan A: Is userId in metadata?
            if (metadata?.userId) {
                // Yes! Use it
                userId = metadata.userId;
            } else {
                // No! Plan B: Extract from reference
                // Split reference: "PSK-1708000000000-user123" → ["PSK", "1708000000000", "user123"]
                const refParts = reference.split("-");
                // Get the last part (user ID)
                userId = refParts[refParts.length - 1];
            }

            // ===== STEP 6: CONVERT MONEY (KOBO TO NAIRA) =====
            // Paystack sends amount in kobo, but we use naira
            // Divide by 100 to convert (1 Naira = 100 Kobo)
            const amountInNaira = amount / 100;

            // ===== STEP 7: FIND THE USER'S WALLET =====
            // Import Wallet model (where we save money balance)
            const Wallet = require('../models/wallet.models');
            // Find wallet that belongs to this user
            const wallet = await Wallet.findOne({ userId: userId });

            // Check: Did we find the wallet?
            if (wallet) {
                // ===== STEP 8: ADD MONEY TO THE WALLET =====
                // Update wallet: increase balance by the payment amount
                await Wallet.findOneAndUpdate(
                    // Find wallet with this user ID
                    { userId: userId },
                    // Increase the balance
                    { $inc: { balance: amountInNaira } },
                    // Return the updated wallet
                    { new: true }
                );

                // ===== STEP 9: FIND THE USER FOR LOGGING =====
                // Find the user using their ID
                const user = await User.findById(userId);
                // Check: Did we find the user?
                if (user) {
                    // Show success message in console with user email and amount
                    console.log(`Wallet funded via Paystack webhook for user: ${user.email}, Amount: ${amountInNaira} NGN`);
                    // NOTE: In real apps, send email here
                }

                // ===== STEP 10: SEND SUCCESS RESPONSE =====
                // Tell Paystack we successfully processed the payment
                return res.status(200).json({ message: "Wallet funded successfully" });
            } else {
                // Wallet not found!
                // Show error in console
                console.error("Wallet not found for userId:", userId);
                // Tell Paystack wallet was not found
                return res.status(404).json({ message: "Wallet not found" });
            }
        }

        // ===== STEP 11: ACKNOWLEDGE OTHER EVENTS =====
        // For events that are not charge.success, just acknowledge receipt
        return res.status(200).json({ message: "Webhook received" });
    } catch (e) {
        // ===== ERROR HANDLING =====
        // If any error happened, show it in console
        console.error("Paystack webhook error:", e);
        // Tell Paystack something failed
        return res.status(500).json({ message: "Webhook processing failed" });
    }
};

// ===== EXPORT FUNCTIONS =====
// Export all functions so other files can use them
module.exports = { 
    // Export function to initiate Paystack payment
    paystackInitiatePayment, 
    // Export function to verify Paystack payment
    paystackVerifyPayment, 
    // Export function to handle Paystack webhook
    paystackWebhook 
};
