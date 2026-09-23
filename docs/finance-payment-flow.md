# UI/UX Flow to make a payment
- Annual Dues and Security
- For the logged in user
- UI home -> Pay Dues

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