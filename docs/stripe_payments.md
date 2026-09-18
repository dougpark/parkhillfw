Yes, exactly. That four-table design gives you a clean, performant relational model for Cloudflare D1.
To keep the database efficient and structured, you can group that data into the following schema setup:
Core Database Schema Structure
1. households (Household & Address Info)
Stores physical property addresses, primary contacts, and maps directly to Stripe Customer records.
• id (PRIMARY KEY, e.g., HH-1042)
• street_address
• billing_email
• stripe_customer_id (UNIQUE, e.g., cus_...)
• created_at
2. products (Product & Pricing Info)
Mirrors your Stripe catalog locally so your UI loads prices quickly without hitting external APIs.
• id (PRIMARY KEY, e.g., sec_quarterly)
• title (e.g., "Security Dues - Quarterly")
• amount_cents (e.g., 25000 for $250.00)
• billing_interval (year or quarter)
• stripe_price_id (UNIQUE, e.g., price_...)
3. subscriptions (Active Stripe Status Info)
Tracks active recurring plans per household to grant access or determine if dues are paid up.
• id (PRIMARY KEY, Stripe Subscription ID e.g., sub_...)
• household_id (FOREIGN KEY \rightarrow households.id)
• stripe_price_id (FOREIGN KEY \rightarrow products.stripe_price_id)
• status (active, past_due, canceled)
• current_period_end (Timestamp)
4. transactions (Transaction & Payment History Info)
Stores historical line-item charges and receipts populated automatically by your Stripe webhook.
• id (PRIMARY KEY, Stripe Invoice or Charge ID e.g., in_...)
• household_id (FOREIGN KEY \rightarrow households.id)
• stripe_price_id
• amount_cents
• status (succeeded, failed, refunded)
• created_at
• receipt_url
Data Lifecycle & Workflow
1. Frontend Request: When a resident visits your portal, your worker queries products and subscriptions from D1 to show what they owe or what active subscriptions they hold.
2. Checkout Hand-off: When they click pay, your worker passes their stripe_customer_id and selected stripe_price_id to Stripe to open a Hosted Checkout Session.
3. Webhook Response: When Stripe processes the payment, it sends an invoice.payment_succeeded webhook to your Cloudflare Worker.
4. D1 Update: Your worker updates or inserts rows into subscriptions and transactions.
5. QuickBooks Auto-Sync: In the background, the official Stripe-to-QuickBooks connector syncs the payment into QuickBooks Online for your finance person—keeping your local database lean and specialized.