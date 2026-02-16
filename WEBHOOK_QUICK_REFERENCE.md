# Webhook Quick Reference Guide ⚡

## 30-Second Versions

### Paystack Webhook (TL;DR)
```
Payment confirmed by bank ✓
  ↓
Check Secret Password (signature) ✓
  ↓
Extract: Who? How much?
  ↓
Convert Kobo → Naira (÷100)
  ↓
Add money to wallet (+balance)
  ↓
Tell Paystack: "Got it!"
```
**Style:** "Money's safe at bank. Just update our record."

---

### Flutterwave Webhook (TL;DR)
```
Payment might be real (?)
  ↓
Check Secret Password (signature) ✓
  ↓
Ask Flutterwave API: "Is this REALLY real?" ✓
  ↓
Lock the record (prevent duplicate)
  ↓
Add money to wallet
  ↓
Unlock & mark done
  ↓
Tell Flutterwave: "Got it!"

If anything breaks → UNDO EVERYTHING!
```
**Style:** "Don't trust anything. Verify everything. Undo if broken."

---

## Code Pattern Comparison

### Step 1: Verify Signature (Both Do This)

**Paystack:**
```javascript
const hash = crypto.createHmac("sha512", secret)
  .update(JSON.stringify(req.body))
  .digest("hex");
if (hash !== req.headers["x-paystack-signature"]) return 401;
```

**Flutterwave:**
```javascript
const hash = crypto.createHmac('sha256', process.env.FLW_SECRET_KEY)
  .update(JSON.stringify(req.body))
  .digest('hex');
if (hash !== signatureHeader) return 400;
```

**Same idea, different encryption strength!**

---

### Step 2: Double-Check Payment (ONLY Flutterwave)

**Paystack:** ✗ Skips this
```javascript
// Money already confirmed by bank. Trust it!
```

**Flutterwave:** ✓ Does this
```javascript
const verify = await axios.get(
  `https://api.flutterwave.com/v3/transactions/${id}/verify`
);
if (verify.data.status === "success") {
  // NOW process
}
```

**Flutterwave is paranoid!**

---

### Step 3: Lock Record (ONLY Flutterwave)

**Paystack:** ✗ No
```javascript
// Just add money
await Wallet.findOneAndUpdate(
  { userId },
  { $inc: { balance } }
);
```

**Flutterwave:** ✓ Yes
```javascript
// Lock it first
const tx = await Transaction.findOneAndUpdate(
  { referenceNumber: tx_ref, status: "pending" },
  { $set: { status: "processing" } },
  { session }
);

// If webhook comes AGAIN, no "pending" record = skipped!
```

**Prevents double-processing!**

---

### Step 4: Extract User (Both Do This)

**Paystack:** Extra safe with fallback
```javascript
let userId;
if (metadata?.userId) {
  userId = metadata.userId;  // Plan A
} else {
  userId = reference.split("-")[last];  // Plan B
}
```

**Flutterwave:** Simple
```javascript
const userId = extractedFrom(tx_ref);
```

**Paystack has backup plan!**

---

### Step 5: Update Wallet (Small Difference)

**Paystack:** Direct
```javascript
await Wallet.findOneAndUpdate(
  { userId },
  { $inc: { balance: amountInNaira } }  // Just add it
);
```

**Flutterwave:** Safe with session
```javascript
await Wallet.findOneAndUpdate(
  { _id: walletId },
  { $inc: { balance: amount } },
  { session }  // Can rollback!
);
```

**Flutterwave can undo changes!**

---

### Step 6: Error Handling

**Paystack:** Just log it
```javascript
catch (e) {
  console.error(e);
  return 500;
}
```

**Flutterwave:** UNDO everything
```javascript
catch (e) {
  await session.abortTransaction();  // REDO!
  console.error(e);
  return 500;
}
```

**Flutterwave resets on error!**

---

## Syntax vs Creative

### What's SYNTAX (Everyone Does Same)
- ✓ How to verify HMAC signatures
- ✓ How to query database
- ✓ How to parse JSON
- ✓ How to send HTTP responses
- ✓ Try/catch error handling

### What's CREATIVE (Your Design Choices)
- ✓ WHEN to verify (before or after?)
- ✓ WHETHER to double-check (Flutterwave = YES)
- ✓ WHETHER to lock (Flutterwave = YES)
- ✓ HOW to handle errors (Flutterwave = UNDO)
- ✓ WHICH fallback to use (Paystack = Plan B)

**80% Follow patterns. 20% Make smart decisions.**

---

## Decision Matrix

```
Choose PAYSTACK if:
├─ ✓ Building simple e-commerce store
├─ ✓ Quick integration needed
├─ ✓ Small to medium payments
├─ ✓ Time is priority
└─ ✓ Manual review is acceptable

Choose FLUTTERWAVE if:
├─ ✓ High-value transactions
├─ ✓ Security is priority
├─ ✓ Can't afford mistakes
├─ ✓ Automatic self-healing needed
└─ ✓ Enterprise system

MIXED PROJECT? → Go FLUTTERWAVE!
(Better paranoid than bankrupt!)
```

---

## Key Differences At A Glance

| Feature | Paystack | Flutterwave |
|---------|----------|------------|
| Lines of code | ~80 | ~150 |
| Verify signature | ✓ SHA512 | ✓ SHA256 |
| Double-check payment | ✗ | ✓ |
| Lock transactions | ✗ | ✓ |
| Prevent duplicates | ✗ | ✓ |
| Rollback on error | ✗ | ✓ |
| Use sessions | ✗ | ✓ |
| Paranoia level | 🟢 Normal | 🔴 HIGH |
| Best for | Speed | Safety |

---

## Common Mistakes (Avoid These!)

### ❌ WRONG - Paystack
```javascript
// Forgot to verify signature!
const { reference, amount } = req.body;
await Wallet.findOneAndUpdate(...);  // DANGEROUS!
```
**Problem:** Hacker could send fake webhook!

### ✓ RIGHT - Paystack
```javascript
// Verify first!
const hash = crypto.createHmac("sha512", secret)
  .update(JSON.stringify(req.body))
  .digest("hex");
if (hash !== req.headers["x-paystack-signature"]) return 401;

const { reference, amount } = req.body;  // NOW safe
await Wallet.findOneAndUpdate(...);
```

---

### ❌ WRONG - Flutterwave
```javascript
// Locks transaction but what if webhook comes again?
status = "processing"
// ... if error at line 100:
// Status stuck on "processing"!
// Webhook never retries!
```
**Problem:** Permanent stuck transaction!

### ✓ RIGHT - Flutterwave
```javascript
// Use session to UNDO on error
session.startTransaction();
status = "processing"
// ... if error:
session.abortTransaction();  // Resets status back to "pending"!
// Flutterwave retries automatically!
```

---

## The Testing Flow

```
Mock Webhook Test:

1. Send fake signature ✓
2. Verify it's rejected ✓
3. Send real signature ✓
4. Verify it's accepted ✓
5. Check wallet updated ✓
6. Send same webhook again ✓
7. Verify no duplicate (Flutterwave locks!) ✓
```

---

## When Things Break (Real Scenarios)

### Scenario 1: Webhook Sent Twice

**Paystack Result:** 💥 Double payment!
- First webhook: Add ₦5,000 ✓
- Second webhook: Add ₦5,000 again ✗

**Flutterwave Result:** ✓ Single payment!
- First webhook: Lock + Add ₦5,000
- Second webhook: No "pending" status = Skip! ✓

---

### Scenario 2: Fake Webhook from Hacker

**Without signature check:** 💥 Money lost!
```javascript
fake_webhook = {
  reference: "FAKE-123",
  amount: 1000000  // A million!
}
// ❌ Gets processed!
```

**With signature check:** ✓ Rejected!
```javascript
hash = hash_of_fake_body  // Doesn't match our secret
// ✓ Rejected with 401!
```

---

### Scenario 3: Database Connection Fails

**Paystack Result:** ⚠️ Partial failure
- Wallet NOT updated (DB down)
- Paystack thinks success (we said 200)
- Manual cleanup needed!

**Flutterwave Result:** ✓ Full rollback
- Session.abortTransaction()
- Everything reverted
- Webhook automatically retried!

---

## Remember These Numbers

```
Paystack workflow: 5 steps
1. Verify signature
2. Check event type
3. Extract user
4. Add money
5. Respond to Paystack

Flutterwave workflow: 9 steps
1. Verify signature
2. Verify with API
3. Lock record
4. Start session
5. Check event type
6. Extract user
7. Add money
8. Unlock & mark done
9. Commit session

Flutterwave = 1.8x more steps for 10x more safety!
```

---

## Quick Syntax Reference

### Get signature from request
```javascript
Paystack:   req.headers["x-paystack-signature"]
Flutterwave: req.headers["verif-hash"]
```

### Verify HMAC
```javascript
const hash = crypto.createHmac("sha512/sha256", secret)
  .update(JSON.stringify(req.body))
  .digest("hex");
```

### Increment wallet
```javascript
{ $inc: { balance: amount } }  // Makes it bigger
{ $inc: { balance: -amount } } // Makes it smaller (refund)
```

### Start database session (safety)
```javascript
const session = await mongoose.startSession();
session.startTransaction();
// ... operations ...
session.commitTransaction();  // Success!
session.abortTransaction();   // Undo!
```

---

## The Philosophy

```
PAYSTACK PHILOSOPHY:
"Money confirmed by bank. 
 Fast update. Trust the system.
 Fix problems manually if needed."

FLUTTERWAVE PHILOSOPHY:
"Don't trust anything.
 Verify everything.
 Self-healing on errors.
 Prevent problems automatically."
```

**Both are right!**
- Paystack if you understand the tradeoffs
- Flutterwave if you can't afford mistakes

---

## Your Next Steps

1. ✓ Understand WHAT each webhook does
2. ✓ Understand WHY it does it (security level)
3. ✓ Pick one for your project
4. → Implement it correctly
5. → Test with real + fake data
6. → Monitor for errors
7. → Handle edge cases

Good luck! 🚀✨
