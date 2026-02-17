// Import Flutterwave library (payment service tool)
const Flutterwave = require("flutterwave-node-v3");
// Import User model (where we store user information)
const User = require('../models/auth.models');
// Import axios (tool to send messages to other servers)
const axios = require('axios');
// Import Transaction model (where we save payment records)
const Transaction = require('../models/transactions.models');
// Import Wallet model (where we save money balance)
const Wallet = require('../models/wallet.models');
// Import mongoose for safe ID conversion
const mongoose = require('mongoose');

// ============ REDIRECT USER TO FLUTTERWAVE PAYMENT PAGE ============
// Function to create payment link and send user to Flutterwave
const redirectUrl = async (req, res) => {
    // Get the user's ID from the logged-in user
    const {userId} = req.user;
    // Get payment information from the request body (amount, redirect URL, currency, account number)
    const {amount , redirectUrl: clientRedirectUrl, currency , accountNumber} = req.body;
    
    // Check: Is userId missing? (User not logged in?)
    if(!userId){
        // Send error: User not found
        return res.status(400).json({message : "User not found"});
    }
    
    // Check: Are any required fields missing?
    if(!amount || !clientRedirectUrl || !currency){
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
        // Format: TX-[time]-[userId]
        const txRef = `TX-${Date.now()}-${userId}`;

        // Create the payment request message for Flutterwave
        // Send POST (message) to Flutterwave's payment API
        const response = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            {
                // Transaction reference (our unique ID)
                tx_ref: txRef,
                // Amount of money to pay
                amount: amount,
                // Currency (NGN, USD, etc.)
                currency: currency,
                // Where to send user after payment
                redirect_url: clientRedirectUrl,
                // Customer information
                customer: {
                    // User's email
                    email: user.email,
                    // User's name
                    name: user.name,
                    // User's phone number
                    phoneNumber: user.phoneNumber,
                },
                // Payment page customization
                customizations: {
                    // Title shown on payment page
                    title: 'Flutterwave Standard Payment',
                },
            },
            {
                // Headers = instructions for how to send this message
                headers: {
                    // Authorization: Secret key to prove we're allowed to use Flutterwave
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    // Content-Type: Tell them we're sending JSON format
                    'Content-Type': 'application/json',
                },
            }
        );

        // Find the wallet using the account number
        const wallet = await Wallet.findOne({accountNumber : accountNumber});

        // Create a new transaction record (save payment information)
        const newTransaction = new Transaction({
            // User's ID
            userId: mongoose.Types.ObjectId(userId),
            // Wallet's ID
            walletId: mongoose.Types.ObjectId(wallet._id),
            // Our reference number for this transaction
            referenceNumber: txRef,
            // Type: credit (money coming IN)
            type: "credit",
            // Amount of money
            amount: amount,
            // Currency
            currency: currency,
            // Balance BEFORE this payment
            balanceBefore: wallet.balance,
            // Balance AFTER this payment (add the amount)
            balanceAfter: parseFloat(wallet.balance) + parseFloat(amount),
            // Description of what happened
            description: "Wallet funding via Flutterwave",
            // Status: pending (waiting for payment)
            status: "pending",
        });
        
        // Show the response in console for debugging
        console.log(response);

        // Save the transaction to database
        await newTransaction.save();

        // Send success message with payment link to user
        return res.status(200).json({
            message : "Redirecting to payment", 
            paymentLink : response.data.data.link
        });

    } catch (error) {
        // If any error happened, show it in console
        console.error("Error in redirectUrl:", error);
        // Send error message to user
        return res.status(500).json({message : "Internal Server Error"});
    }
}


// ============ WEBHOOK: WHEN FLUTTERWAVE SENDS PAYMENT CONFIRMATION ============
// This function is called when user successfully pays on Flutterwave
const flutterwaveWebhook = async (req, res) => {
  // Start a database session (like a safety net for database changes)
  const session = await mongoose.startSession();
  
  try {
    // ===== STEP 1: VERIFY THE MESSAGE IS REALLY FROM FLUTTERWAVE (SECURITY) =====
    // Get the secret password from .env file
    const secretHash = process.env.FLW_SECRET_HASH;
    // Get the signature (fingerprint) from the message headers
    const signature = req.headers["verif-hash"];

    // Check: Does the signature match our secret password?
    if (!signature || signature !== secretHash) {
      // No match = Fake message! Reject it!
      console.log("Invalid webhook signature");
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ===== STEP 2: GET THE PAYMENT INFORMATION =====
    // Get the message body (contains payment info)
    const payload = req.body;
    // Show the data we received in console for debugging
    console.log("Flutterwave Webhook Payload:", payload);

    // ===== STEP 3: CHECK IF PAYMENT IS SUCCESSFUL =====
    // Check: Is status "successful" AND event is "charge.completed"?
    if (payload.data.status === "successful" && payload.event === "charge.completed") {
      // Extract payment information from the message
      const { tx_ref, amount, currency, id: transactionId } = payload.data;

      // ===== STEP 4: DOUBLE-CHECK WITH FLUTTERWAVE (EXTRA SECURITY) =====
      // Ask Flutterwave: "Is this payment REALLY real?"
      const verifyResponse = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
        {
          headers: {
            // Authorization: Use secret key to prove we're allowed to check
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          },
        }
      );

      // Show the verification response in console
      console.log("Flutterwave Verify Response:", verifyResponse.data);

      // Get the verification data
      const verifyData = verifyResponse.data;

      // ===== STEP 5: VERIFY ALL DETAILS MATCH =====
      // Check if all information matches (security check)
      if (
        verifyData.status === "success" &&
        verifyData.data.status === "successful" &&
        verifyData.data.amount === amount &&
        verifyData.data.currency === currency
      ) {
        // ===== STEP 6: EXTRACT THE USER ID FROM REFERENCE =====
        // Split the reference: "TX-1708000000000-user123" → ["TX", "1708000000000", "user123"]
        const txParts = tx_ref.split("-");
        // Get the last part (user ID)
        const userId = txParts[txParts.length - 1];

        // ===== STEP 7: START TRANSACTION (SAFETY MODE) =====
        // Begin the transaction (like putting a "DO NOT TOUCH" sticker)
        session.startTransaction();

        // ===== STEP 8: LOCK THE TRANSACTION RECORD (PREVENT DUPLICATES) =====
        // Find the transaction AND update it to "processing" status (lock it)
        const transactionRecord = await Transaction.findOneAndUpdate(
          { 
            // Find transaction with this reference AND status is "pending"
            referenceNumber: tx_ref, 
            status: "pending"
          },
          { 
            // Update to these values
            $set: { 
              // Change status to "processing" (now it's LOCKED!)
              status: "processing",
              // Record the time we locked it
              lockedAt: new Date()
            } 
          },
          { 
            // Return the updated record
            new: true, 
            // Use our safety session
            session 
          }
        );
        // Show confirmation in console
        console.log("Transaction Record Found and Locked:", transactionRecord);

        // Check: Did we find and lock the transaction?
        if (!transactionRecord) {
          // Transaction not found or already locked! Undo everything!
          await session.abortTransaction();
          // Check if it was already processed
          const existingTransaction = await Transaction.findOne({ referenceNumber: tx_ref });
          // If status is not "pending", it means it was already processed
          if (existingTransaction && existingTransaction.status !== "pending") {
            // Already processed - no need to process again
            console.log("Transaction already processed:", existingTransaction.status);
            return res.status(200).json({ message: "Transaction already processed" });
          }
          // Transaction doesn't exist - error!
          return res.status(404).json({ message: "Transaction record not found" });
        }

        // ===== STEP 9: UPDATE THE WALLET BALANCE =====
        // Find the wallet AND add money to it
        const wallet = await Wallet.findOneAndUpdate(
          { 
            // Find wallet using wallet ID from transaction
            _id: transactionRecord.walletId 
          },
          { 
            // Increase balance by the payment amount
            $inc: { balance: amount },
            // Record the time of update
            $set: { lastUpdatedAt: new Date() }
          },
          { 
            // Return the updated wallet
            new: true, 
            // Use our safety session (so we can undo if needed)
            session 
          }
        );

        // Show wallet update in console
        console.log("User Wallet Found and Updated:", wallet);

        // Check: Did wallet update succeed?
        if (wallet) {
          // ===== STEP 10: FIND THE USER FOR EMAIL NOTIFICATION =====
          // Find the user using their ID
          const user = await User.findById(transactionRecord.userId).session(session);
          // Show user found in console
          console.log("User Found for Email Notification:", user);

          // Check: Did we find the user?
          if (user) {
            // Show success message in console with user email and amount
            console.log(`Wallet funded successfully for user: ${user.email}, Amount: ${amount} ${currency}`);
            // NOTE: In real apps, send email here like: sendEmail(user.email, ...)
          }

          // ===== STEP 11: MARK TRANSACTION AS SUCCESSFUL =====
          // Update the transaction record to "successful" and unlock it
          await Transaction.findOneAndUpdate(
            { referenceNumber: tx_ref },
            { 
              $set: { 
                // Status: transaction is now complete
                status: "successful",
                // Record the completion time
                completedAt: new Date(),
                // Remove the lock (set to null)
                lockedAt: null
              } 
            },
            { 
              new: true, 
              session 
            }
          );

          // ===== STEP 12: SAVE ALL CHANGES (COMMIT) =====
          // Commit the transaction (save everything permanently!)
          await session.commitTransaction();

          // ===== STEP 13: SEND SUCCESS RESPONSE =====
          // Send success message to Flutterwave
          return res.status(200).json({ message: "Wallet funded successfully" });
        } else {
          // Wallet not found! Undo everything!
          await session.abortTransaction();
          // Show error in console
          console.error("Wallet not found for userId:", userId);
          // Send error to Flutterwave
          return res.status(404).json({ message: "Wallet not found" });
        }
      } else {
        // Verification failed! Payment details don't match!
        console.error("Transaction verification failed", verifyData);
        // Send error to Flutterwave
        return res.status(400).json({ message: "Transaction verification failed" });
      }
    }

    // ===== STEP 14: ACKNOWLEDGE OTHER EVENTS =====
    // For events that are not charge.success, just acknowledge receipt
    return res.status(200).json({ message: "Webhook received" });
    
  } catch (e) {
    // ===== ERROR HANDLING =====
    // If any error happened, undo everything!
    // Check: Is there an active transaction to abort?
    if (session.inTransaction()) {
      // Yes - abort/undo all changes!
      await session.abortTransaction();
    }
    // Show error in console for debugging
    console.error("Webhook error:", e);
    // Send error message to Flutterwave
    return res.status(500).json({ message: "Webhook processing failed" });
  } finally {
    // ===== CLEANUP =====
    // End the database session (close the safety net)
    session.endSession();
  }
};


// ===== EXPORT FUNCTIONS =====
// Export both functions so other files can use them
module.exports = {
    // Export redirectUrl function (for initiating payment)
    redirectUrl,
    // Export flutterwaveWebhook function (for receiving payment confirmation)
    flutterwaveWebhook
};
