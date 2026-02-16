# Flutterwave Webhook Explained Simply 🎯

## What is a Webhook? (Simple Analogy)

Imagine you order pizza online:
1. **You:** "I want pizza, here's my money!" (You pay)
2. **Pizza place:** Checks if payment is real → "Payment OK!"
3. **Pizza place calls you:** "Hey! We got your payment. Making pizza now!" (Webhook)

A **webhook** is exactly this phone call. When Flutterwave (payment service) gets your money, it **calls back** your app to say "Payment succeeded!"

---

## The Flutterwave Webhook Code Breakdown

### **Line-by-Line Explanation** (Even a 5-year-old can understand):

```javascript
const flutterwaveWebhook = async (req, res) => {
```
**What it means:** This is like opening a mailbox. When Flutterwave sends payment confirmation, this function "opens" it.

```javascript
const session = await mongoose.startSession();
```
**What it means:** We start a "special protection mode" to make sure we don't accidentally process the same payment twice (like eating two portions of food for one order).

---

### **Step 1: Check If It's Really From Flutterwave (Security Guard)**

```javascript
const secretHash = process.env.FLW_SECRET_HASH;
const signature = req.headers["verif-hash"];

if (!signature || signature !== secretHash) {
  console.log("Invalid webhook signature");
  return res.status(401).json({ message: "Unauthorized" });
}
```

**Simple version:**
- Flutterwave gives us a **secret password** (stored in `.env` file)
- When they send webhook, they include this password in the message
- We check: "Does the password match our password?"
- If NO → Someone is pretending to be Flutterwave! Send them away.

**Analogy:** Like a secret handshake at a club. If you don't know the handshake, you can't get in!

---

### **Step 2: Get the Payment Info (Opening the Package)**

```javascript
const payload = req.body;
console.log("Flutterwave Webhook Payload:", payload);
```

**What it means:** Get all the information about the payment from the message Flutterwave sent us.

**The payload contains:**
```
{
  event: "charge.completed",
  data: {
    tx_ref: "TX-1708000000000-user123",     ← Order reference number
    amount: 5000,                            ← How much money
    currency: "NGN",                         ← Type of money (Naira)
    status: "successful",                    ← Did payment work?
    id: "transactionId123"                   ← Payment ID
  }
}
```

---

### **Step 3: Check If Payment Is Successful**

```javascript
if (payload.data.status === "successful" && payload.event === "charge.completed") {
```

**What it means:** Check two things:
1. Is the status "successful"? (Did money come through?)
2. Is the event "charge.completed"? (Is this about a payment?)

**Analogy:** Checking two boxes on a checklist.

---

### **Step 4: Verify Payment With Flutterwave (Double-Check)**

```javascript
const verifyResponse = await axios.get(
  `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
  {
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
    },
  }
);
```

**What it means:** Don't trust just one message! We ask Flutterwave directly: "Is this payment REALLY successful?"

**Analogy:** Like calling the pizza place back to confirm: "Did you really get my payment?" Even though they already called you!

**Why?** Hackers might try to trick us with fake messages. So we verify directly with the source.

---

### **Step 5: Extract User ID (Finding the Wallet Owner)**

```javascript
const txParts = tx_ref.split("-");
const userId = txParts[txParts.length - 1];
```

**What it means:** The transaction reference looks like: `TX-1708000000000-user123`

We **split** it by "-" and grab the **last part** (user123) to know whose wallet to update.

**Analogy:** Reading an address on a letter. The last part tells us which house to deliver to.

---

### **Step 6: Lock the Transaction (Prevent Double Processing)**

```javascript
const transactionRecord = await Transaction.findOneAndUpdate(
  { 
    referenceNumber: tx_ref, 
    status: "pending" 
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
```

**What it means:** 
- Find the transaction in database with reference `tx_ref` that is still "pending"
- Change its status to "processing" (like saying "we're working on it")
- Record the time we started

**Why "processing" status?** If webhook comes twice (network glitch), the second time it won't find a "pending" transaction, so it won't duplicate the payment!

**Analogy:** Putting a "DO NOT TOUCH" sticker on something you're working on.

---

### **Step 7: Update Wallet Balance (Add Money to Account)**

```javascript
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
```

**What it means:**
- Find the wallet (using `walletId` from transactionRecord)
- **Add money** to it: `$inc: { balance: amount }`
  - `$inc` means "increase"
  - If balance was 1000, and amount is 500, new balance = 1500
- Record when we made this change: `lastUpdatedAt: new Date()`

**Analogy:** Like a bank teller depositing money into your account.

---

### **Step 8: Find The User For Email**

```javascript
const user = await User.findById(transactionRecord.userId).session(session);

if (user) {
  console.log(`Wallet funded successfully for user: ${user.email}, Amount: ${amount} ${currency}`);
}
```

**What it means:** 
- Get the user's info (email, name, etc.)
- Log a message saying "Successfully added money to user's wallet"

**In real apps:** You'd send an email to user: "Your wallet received ₦5,000!"

---

### **Step 9: Mark Transaction As Complete**

```javascript
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
```

**What it means:**
- Change transaction status from "processing" to "successful"
- Record the time: `completedAt: new Date()`
- Remove the "lock": `lockedAt: null`

**Analogy:** Changing task on to-do list from "In Progress" to "Done ✓"

---

### **Step 10: Confirm Everything Worked**

```javascript
await session.commitTransaction();
return res.status(200).json({ message: "Wallet funded successfully" });
```

**What it means:**
- `commitTransaction()`: "Save everything! All changes are final."
- `return res.status(200)`: Send message back to Flutterwave: "We got it! All good! ✓"

**Analogy:** Signing a receipt after successful transaction.

---

### **Error Handling (What if something goes wrong?)**

```javascript
} catch (e) {
  if (session.inTransaction()) {
    await session.abortTransaction();
  }
  session.endSession();
  return res.status(500).json({ message: "Webhook processing failed" });
}
```

**What it means:** If ANY error happens:
- **UNDO everything!** (`abortTransaction()`) - Like saying "cancel that, I changed my mind"
- **Close the session** and tell Flutterwave: "Something went wrong, try again"

**Why UNDO?** If wallet gets updated but user isn't notified, that's bad! So we UNDO and let Flutterwave try again.

---

## How It All Connects (The Story)

```
1. User pays ₦5,000 on Flutterwave → Payment successful
                                    ↓
2. Flutterwave calls our webhook ← "Hey! Payment received!"
                                    ↓
3. We check: "Is this real?" (verify signature)
                                    ↓
4. We double-check with Flutterwave: "Is this REALLY real?"
                                    ↓
5. We find the transaction in our database
                                    ↓
6. We "lock" it (status = "processing") to prevent duplicate payments
                                    ↓
7. We add ₦5,000 to user's wallet
                                    ↓
8. We find the user to send them an email
                                    ↓
9. We mark transaction as "successful"
                                    ↓
10. We tell Flutterwave: "GOT IT! ✓ All done!"
```

---

## Is This Syntax or Creative Thinking?

### **Most is SYNTAX (Following Rules):**
- `async`, `await`, `findOneAndUpdate()` etc. are standard JavaScript/MongoDB syntax
- These are the **language rules** (like grammar in English)

### **Some is CREATIVE THINKING (Your Own Design):**

1. **Idempotency Logic** - "processing" status to prevent duplicates
   - You have to think: "What if webhook comes twice?"
   - This is a **smart decision**, not syntax

2. **Transaction Locking** - Using `session.startTransaction()`
   - You have to think: "How do I make sure all changes succeed together?"
   - This is **creative problem-solving**

3. **Verification Logic** - Calling Flutterwave API to double-check
   - You have to think: "Should I trust the first message?"
   - This is **security thinking**

4. **Error Handling** - Aborting on errors
   - You have to think: "What could go wrong and what's the best recovery?"
   - This is **defensive coding** (creative)

### **The 80/20 Rule:**
- **80% is following standard patterns** (async/await, findOneAndUpdate, error handling)
- **20% is creative thinking** (deciding WHICH patterns to use and in what order)

---

## Simple Analogy: Building a Lego House

- **Syntax** = Lego pieces (blocks, connectors)
- **Creative Thinking** = How you arrange them

You can't build a house without knowing what Lego pieces do (syntax), but different people arrange them differently (creative).

Our webhook code:
- Uses standard Lego pieces (async/await, database queries)
- Arranges them in a SMART way (locking, verifying, error handling)

---

## Key Takeaway 🎯

The webhook code does this storytelling:

> "A payment came in. Is it real? Let me check twice. Let me lock the record so I don't process it twice. Now let me add money to the wallet. All done! Tell Flutterwave I got it. If something breaks, I'll undo everything."

That's **smart money handling**—not just syntax! ✨
