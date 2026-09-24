# UI/UX Flow to make a payment
- Annual Dues and Security
- For the logged in user
- UI home -> Pay Dues
- Uses Stripe Checkout customized to our look and feel
- No credit card or sensitive payment information is stored locally; all payment processing is handled securely by Stripe.

# Household-ID
- Does Stripe need a unique id for this address, resident user combination?
- need to create a new unique Household-ID for this address, resident user combination when making the first payment or setting up a recurring payment
- this Household-ID will be used for all future payments and recurring payment setups for this household
- resets when the household is archived and set to vacant 
- UI flow to set vacant: Admin -> Directory -> Edit Household -> Archive Household
•	Address-Anchored ID: Consider making the primary identifier the physical property itself (e.g., property_id), with household_id representing the active occupancy unit. When set to Vacant/Archived, soft-delete or close the active household_id and cancel active Stripe Subscriptions via API so a former resident is not billed after moving out.

## Products apply to Households
- products apply to all the residents in the household
- if a second resident logs in they should see the status of the household's payments

# Pay Dues UI

## Default Payment Dashboard
- shows summary of current Annual Dues and Security payments and expiration dates

## Pay Dues UI
- click make a payment
- payment screen
- select products - Annual Dues, Annual Pacesetter Dues, Annual Security, Quarterly Security
- ui shows totals to be paid today
- click pay now
- transfer to Stripe payments screen (what info does our system send to Stripe?)
- complete payment on Stripe
- return to confirmation screen in the app (what info does Stripe send back?)
- system sends confirmation email to user
- system logs payment transaction details

# Payment History UI
- click view payment history
- payment history screen displays list of past payments with details (date, amount, products)
- click for full details of a payment, similar format to the payment confirmation email
- option to filter by product or date range
- option to export payment history as CSV or Excel

# Manage Recurring Payments UI
- click manage recurring payments
- recurring payments screen displays list of active recurring payments with details (product, amount, frequency, next payment date)
- option to edit or cancel a recurring payment
- option to add a new recurring payment
- system sends confirmation email to user after any changes to recurring payments

# System updates household records
- marks Annual Dues and type as paid for the period, shows expiration date of the current payment cycle
- marks Security as paid for the period, shows expiration date of the current payment cycle and flag if recurring payment scheduled

# Prefill

## Can you pre-send customer info (Name, Address, Email) and household_id to Stripe?
Yes, fully. You can pass all of this pre-filled data server-side when you initialize the Stripe Checkout Session.

## How it works in practice:
	1.	Pre-filling Visible Fields (Name, Email, Address):
	When initializing the Stripe Checkout Session, you can pass the resident's name, email, and address so that these fields are pre-filled on the payment screen. This improves the user experience by reducing the amount of information the resident needs to manually enter.

## When creating a Checkout Session via your backend Worker, you can explicitly pass:
•	customer_email: Pre-fills their email address so they don't have to re-type it.
•	customer_details: Pre-populates the resident's name and physical address on the payment screen.

	2.	Attaching Hidden System Data (household_id):
Stripe provides a metadata key-value dictionary on Checkout Sessions, Customers, and Subscriptions specifically for this purpose. You can attach internal database keys without the customer ever seeing them.
Example:
```json
{
  "metadata": {
    "household_id": "12345"
  }
}
```

## Key Workflow Advantage: Zero Manual Re-Entry
- By passing customer_email and your custom metadata:
•	The payment page opens pre-filled with the resident's email and name, reducing friction.
•	When the payment completes, Stripe sends an asynchronous checkout.session.completed webhook event back to your server containing your exact metadata.household_id.
•	Your backend reads that household_id from the payload and immediately updates the active paid status for the household in your database, completely hands-free.

# Subscriptions

How Customers See Upcoming Payments Without a Stripe Login
Because residents do not have a standard password-based Stripe account, there are three primary ways for them to see upcoming payments:

## Inside Your App's Pay Dues Dashboard (Recommended)
Since our system stores the household_id and tracks subscription entitlements, our app should display the next payment date.
•	Query the subscription via the Stripe API on your backend (or store the current_period_end date locally when processing webhooks).
•	Render a simple card on the user's dashboard:
Quarterly Security Dues: $<sample>
Next Automatic Payment: <sample>>
Payment Method: <sample>

## Email Notifications
Our system will send automated email reminders to residents about upcoming payments, including the next payment date and amount due.
- 7 days in advance of the next payment due date.
- 1 day in advance of the next payment due date.
- Email receipt acknowledging the completed payment.

