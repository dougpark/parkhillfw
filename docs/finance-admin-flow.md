# Finance Audit Log
- Finance has its own dedicated audit log to track all financial activities, including manual payments, product changes, Quickbooks exports, and Stripe configuration updates.
- Permissions required: Finance

## Audit log UI
- Audit log displays a chronological list of all financial activities with details such as user, action, date, and status.

# Finance Admin UI/UX
- For the Finance Admin

- click on Admin -> Finance section
- admin dashboard displays key financial metrics at a glance
- admin dashboard displays summary of payments, recurring payments, and user activity

## Manual Payment UI
- click on manual payment
- manual payment screen displays search for user name and address households
- option to select a user and enter payment details (amount, product, payment method)
- option to mark payment as completed
- system logs all manual payments for audit purposes

### System updates household records
- marks Annual Dues and type as paid for the period, shows expiration date of the current payment cycle
- marks Security as paid for the period, shows expiration date of the current payment cycle and flag if recurring payment scheduled

## Quickbooks Export UI
- select date range
- click export button
- csv file downloads
- system logs all Quickbooks exports for audit purposes

## Finance Reports UI
- click on finance reports
- finance reports screen displays list of available reports (e.g., payment summary, recurring payments, user activity)
- option to select a report and view its details
- option to filter reports by date range or product
- option to export reports as CSV or Excel
- system logs all report views and exports for audit purposes   

## Stripe Products UI
- click on Stripe products
- Stripe products screen displays list of all Stripe products with details (name, price, description)
- option to add a new Stripe product
- option to edit or delete an existing Stripe product
- Products:
  - Regular Annual Dues, Membership category, $150
  - Pacesetter Annual Dues, Membership category, $500
  - Security Annual, Security category, $1000
  - Security Quarterly, Security category, $250
- System updates products with Stripe product IDs for synchronization purposes
- system logs all changes to Stripe products for audit purposes

## Stripe Configuration UI
- click on Stripe configuration
- Stripe configuration screen displays current Stripe account details and API keys
- option to update Stripe account information
- option to regenerate API keys
- system logs all changes to Stripe configuration for audit purposes

## Stripe - Managing Mixed One-Time and Recurring Items
•	Stripe Checkout supports mixing one-time items (Annual Dues) and recurring items (Quarterly Security) into a single session by setting the session mode = 'subscription'.
•	Important: If a user pays one-time dues and sets up a recurring subscription in the same transaction, Stripe creates a subscription where the one-time item is billed as a single invoice item on the first billing cycle.

# Example DB Tables for Payments

Property (Physical Address)
 └── Household (Active Occupancy, household_id, stripe_customer_id)
      ├── Users (Residents linked to household_id)
      ├── Payment Records (household_id, user_id, stripe_payment_id, amount, date)
      └── Entitlements / Expiration Dates
           ├── annual_dues_paid_until (DATE)
           ├── security_paid_until (DATE)
           └── security_recurring_active (BOOLEAN)