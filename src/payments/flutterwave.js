const Flutterwave = require("flutterwave-node-v3");
const User = require('../models/auth.models');
const axios = require('axios');
const Transaction = require('../models/transactions.models');
const Wallet = require('../models/wallet.models');
const redirectUrl = async (req, res) =>{
    const {userId} = req.user;
    const {amount , redirectUrl, currency , accountNumber} = req.body
    if(!userId){
        return res.status(400).json({message : "User not found"});
    }
    if(!amount || !redirectUrl || !currency){
        return res.status(400).json({message : "All fields are required"});
    }
    try {
        const user = User.findById(userId);
        if(!user){
            return res.status(400).json({message : "User does not exist"});
        }

        const txnRef = `TX-${Date.now()} - ${userId}`;

        const flw = new Flutterwave(
            process.env.FLW_PUBLIC_KEY,
            process.env.FLW_SECRET_KEY
        )
        const response = await axios.post(
		'https://api.flutterwave.com/v3/payments',
		{
			tx_ref: txnRef,
			amount: amount,
			currency: currency,
			redirect_url: redirectUrl,
			customer: {
				email: user.email,
				name: user.name,
				phoneNumber:user.phoneNumbeR,
			},
			customizations: {
				title: 'Flutterwave Standard Payment',
			},
		},
		{
			headers: {
				Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
				'Content-Type': 'application/json',
			},
		}
	);
    const wallet = await Wallet.findOne({accountNumber : accountNumber})

    const newTransaction = new Transaction({
        userId: mongoose.Types.ObjectId(userId),
        walletId: mongoose.Types.ObjectId(wallet._id),
        referenceNumber: txRef,
        type: "credit",
        amount: amount,
        currency: currency,
        balanceBefore: wallet.balance,
        balanceAfter: parseFloat(wallet.balance) + parseFloat(amount),
        description: "Wallet funding via Flutterwave",
        status: "pending",
    })
    console.log(response)

    await newTransaction.save();

    return res.status(200).json({message : "Redirecting to payment", paymentLink : response.data.data.link});

    } catch (error) {
        console.error("Error in redirectUrl:", error);
        return res.status(500).json({message : "Internal Server Error"});
    }

}

/* const flutterwaveWebhook = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const secretHash = process.env.FLW_SECRET_HASH;
            const signature = req.headers["flutterwave-signature"];
            if (!signature || (signature !== secretHash)) {
                console.error("Invalid signature in Flutterwave webhook");
                return res.status(401).json({ message: "Unauthorized" });
            }
            const payload = req.body;
            console.log(payload);

            if(payload.event === "charge.completed" && payload.data.status === "successful"){
                console.log("Processing successful charge...");
                const {tx_ref, amount, currency, id:transactionId} = payload.data;

                const verifiedTransaction = axios.get(`https://api.flutterwave.com/v3/transactions/${transactionId}`), {
                    headers: {
                        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    },
                }
            };
            console.log("Transaction verified successfully:", verifiedTransaction.data);

            const verifyData = verifiedTransaction.data;
            if(verifyData.status === "success" && verifyData.data.status === "successful" && verifyData.data.tx_ref === tx_ref && verifyData.data.amount === amount && verifyData.data.currency === currency){
                const txParts = tx_ref.split(" - ");
                const userId = txParts[length - 1];
                
                session.startTransaction();

                const transaction = await Transaction.findOneAndUpdate(
                    {referenceNumber: tx_ref, status: "pending"},
                    {
                        $set: {
                            status: "processing",
                            lockedAt: new Date(),
                        }
                    },
                    {
                        new: true,
                        session,

                    }
                )
                console.log("Transaction updated to processing:", transaction);
                if(!transaction){
                    await session.abortTransaction();
                    console.error("Transaction not found or already processed for reference:", tx_ref);

                    const existingTransaction = await Transaction.findOne({referenceNumber: tx_ref});
                    if(existingTransaction){
                        console.error("Existing transaction found with status:", existingTransaction.status);
                        return res.status(400).json({message: "Transaction already processed"});
                    }

                    return res.status(404).json({message: "Transaction not found"});
                }

                const wallet = await Wallet.findOneAndUpdate({
                    _id : transaction.walletId
                })
                if(!wallet){
                    await session.abortTransaction();
                    console.error("Wallet not found for transaction:", tx_ref);
                    return res.status(404).json({message: "Wallet not found"});
                }
            }

    }catch(err){
        console.error("Error in flutterwaveWebhook:", err);
        return res.status(500).json({message : "Internal Server Error"});
    }
} */
const flutterwaveWebhook = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    // Verify the webhook signature
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== secretHash) {
      console.log("Invalid webhook signature");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = req.body;

    console.log("Flutterwave Webhook Payload:", payload);

    // Check if payment was successful
    if (payload.data.status === "successful" && payload.event === "charge.completed") {
      const { tx_ref, amount, currency, id: transactionId } = payload.data;

      // Verify the transaction with Flutterwave
      const verifyResponse = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          },
        }
      );

      console.log("Flutterwave Verify Response:", verifyResponse.data);

      const verifyData = verifyResponse.data;

      if (
        verifyData.status === "success" &&
        verifyData.data.status === "successful" &&
        verifyData.data.amount === amount &&
        verifyData.data.currency === currency
      ) {
        // Extract userId from tx_ref (format: TX-timestamp-userId)
        const txParts = tx_ref.split("-");
        const userId = txParts[txParts.length - 1];

        // Start the transaction
        session.startTransaction();

        // Atomically lock the transaction record by updating status to "processing"
        // This prevents duplicate webhook processing (idempotency)
        const transactionRecord = await Transaction.findOneAndUpdate(
          { 
            referenceNumber: tx_ref, 
            status: "pending" // Only process if still pending
          },
          { 
            $set: { 
              status: "processing",
              lockedAt: new Date()
            } 
          },
          { 
            new: true, 
            session 
          }
        );
        console.log("Transaction Record Found and Locked:", transactionRecord);

        if (!transactionRecord) {
          await session.abortTransaction();
          // Check if already processed or not found
          const existingTransaction = await Transaction.findOne({ referenceNumber: tx_ref });
          if (existingTransaction && existingTransaction.status !== "pending") {
            console.log("Transaction already processed:", existingTransaction.status);
            return res.status(200).json({ message: "Transaction already processed" });
          }
          return res.status(404).json({ message: "Transaction record not found" });
        }

        // Atomically lock and update the wallet balance
        // Using findOneAndUpdate ensures atomic operation and prevents race conditions
        const wallet = await Wallet.findOneAndUpdate(
          { _id: transactionRecord.walletId },
          { 
            $inc: { balance: amount },
            $set: { lastUpdatedAt: new Date() }
          },
          { 
            new: true, 
            session 
          }
        );

        console.log("User Wallet Found and Updated:", wallet);

        if (wallet) {
          // Get user for email notification
          const user = await User.findById(transactionRecord.userId).session(session);
          console.log("User Found for Email Notification:", user);

          if (user) {
            // Send success email (optional)
            console.log(`Wallet funded successfully for user: ${user.email}, Amount: ${amount} ${currency}`);
          }

          // Update the transaction status to successful and record completion
          await Transaction.findOneAndUpdate(
            { referenceNumber: tx_ref },
            { 
              $set: { 
                status: "successful",
                completedAt: new Date(),
                lockedAt: null
              } 
            },
            { new: true, session }
          );

          // Commit the transaction
          await session.commitTransaction();

          return res.status(200).json({ message: "Wallet funded successfully" });
        } else {
          await session.abortTransaction();
          console.error("Wallet not found for userId:", userId);
          return res.status(404).json({ message: "Wallet not found" });
        }
      } else {
        console.error("Transaction verification failed", verifyData);
        return res.status(400).json({ message: "Transaction verification failed" });
      }
    }

    // For other events, just acknowledge receipt
    return res.status(200).json({ message: "Webhook received" });
  } catch (e) {
    // Abort the transaction on error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Webhook error:", e);
    return res.status(500).json({ message: "Webhook processing failed" });
  } finally {
    // End the session
    session.endSession();
  }
};





module.exports = {redirectUrl,
    flutterwaveWebhook
};