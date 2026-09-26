# Transaction CSV Export

## Status: implemented

1. **D1 schema / webhook ingestion** — `payments` now has `stripe_charge_id`, `payout_id`, and
   `status` columns (migration `0023_payments_quickbooks_fields.sql`). `payment_method` is
   captured from Stripe's actual `charge.payment_method_details.type` (`card` or
   `us_bank_account`) instead of being hardcoded to `card`.
2. **QuickBooks GL mapping** — `INCOME_ACCOUNT_BY_CATEGORY` in `src/lib/product-catalog.ts` maps
   `dues` → `4000 - Annual Dues Revenue` and `security` → `4100 - Security Patrol Dues`. This is a
   static map (not a DB column) since there are only two categories today; if per-product-type
   codes are ever needed, promote it to a full `Record<ProductType, string>`.
3. **CSV generator** — `downloadCsv()` in `AdminFinanceTransactionReportView.vue` now emits the
   full QuickBooks-ready column set below instead of the old 8-column display export.

### Data still not captured — and why

- **Payout_ID reconciliation is asynchronous by nature.** Stripe batches charges into payouts on
  a schedule (daily/weekly), so a charge's payout is unknown at the moment `invoice.paid` fires.
  The `payout.paid` webhook handler backfills `payments.payout_id` by listing that payout's
  balance transactions and matching charge IDs — but this means a payment's `Payout_ID` column
  will be blank in the CSV until Stripe actually pays it out (typically within a few days). This
  is expected, not a bug — re-export the CSV after the payout lands if you need the field
  populated for a specific transaction.
- **Refund/dispute status requires two more Stripe Dashboard webhook subscriptions.** The code
  now handles `charge.refunded`, `charge.dispute.created`, and `charge.dispute.closed`, but the
  **staging Dashboard-registered webhook endpoint** (`we_1UJgiALC1nxElUbWeXxUMbxb`) and the local
  `stripe listen --events ...` command both need `payout.paid,charge.refunded,charge.dispute.created,charge.dispute.closed`
  added to their event lists, or these updates will never reach the app.
- **Manual (cash/check) payments** never have a `Transaction_ID`, `Payout_ID`, or Stripe-derived
  `Payment_Method` type beyond what the admin selects — these fields are legitimately blank for
  `source = 'manual'` rows, since there's no Stripe object backing them.
- **Historical rows recorded before this change** (i.e. existing payments) have `stripe_charge_id`
  and `payout_id` as `NULL` and `status` defaulted to `'succeeded'`. Backfilling `stripe_charge_id`
  for old rows would require re-deriving it from `stripe_invoice_id` via the Stripe API — not done
  automatically; only new payments recorded after this migration populate it going forward.

# CSV Column Descriptions


This specification defines the standard CSV export format for payment transactions within the neighborhood management portal. This layout is optimized for accounting reconciliation and direct import into QuickBooks Online or Desktop.

## Column Specifications

| Column Name | Description & Format | Example |
| :--- | :--- | :--- |
| `Transaction_ID` | Unique Stripe Charge or Payment Intent ID (`ch_...` or `pi_...`) | `ch_3M8x92L1aB` |
| `Date` | Date of the transaction (`YYYY-MM-DD`) | `2026-09-25` |
| `Customer_Name` | Full name of the primary resident making the payment | `Doug Park` |
| `Household_ID` | Composite identifier built from address numbers + first letter of each address street word + primary resident name (`[Numbers][Street Initials]-[First]-[Last]`) | `2345LT-Doug-Park` |
| `Address` | Street address of the household | `2345 Lofton Terrace` |
| `Income_Account` | General Ledger (GL) income account code for QuickBooks mapping | `4000 - Annual Dues Revenue` |
| `Product_Category` | High-level category of the product or service (`Dues`, `Security`, etc.) | `Dues` |
| `Product_Description` | Full name or description of the product/tier being purchased | `Pacesetter Annual Dues` |
| `Gross_Amount` | Total transaction amount charged before fees in USD (`0.00`) | `500.00` |
| `Fee_Amount` | Stripe processing fees deducted from the transaction in USD (`0.00`) | `14.80` |
| `Net_Amount` | Payout amount received after fee deduction in USD (`0.00`) | `485.20` |
| `Payment_Method` | Payment method type (`card`, `ach_debit`, `check`) | `card` |
| `Payout_ID` | Stripe Payout or Batch ID (`po_...`) for bank statement matching | `po_1N9876Xyz` |
| `Transaction Status` | Operational status (`succeeded`, `refunded`, `partially_refunded`, `disputed`) | `succeeded` |
| `Coverage_Period` | Date range covered by the payment (`YYYY-MM-DD to YYYY-MM-DD`) | `2026-01-01 to 2026-12-31` |

---

## Sample CSV File Content

```csv
Transaction_ID,Date,Customer_Name,Household_ID,Address,Income_Account,Product_Category,Product_Description,Gross_Amount,Fee_Amount,Net_Amount,Payment_Method,Payout_ID,Transaction Status,Coverage_Period
ch_3M8x92L1aB,2026-09-25,"Doug Park",2345LT-Doug-Park,"2345 Lofton Terrace","4000 - Annual Dues Revenue",Dues,"Pacesetter Annual Dues",500.00,14.80,485.20,card,po_1N9876Xyz,succeeded,"2026-01-01 to 2026-12-31"
ch_3M8x93L1aC,2026-09-25,"Doug Park",2345LT-Doug-Park,"2345 Lofton Terrace","4000 - Annual Dues Revenue",Dues,"Regular Annual Dues",150.00,4.65,145.35,card,po_1N9876Xyz,succeeded,"2026-01-01 to 2026-12-31"
ch_3M8x94L1aD,2026-09-25,"Doug Park",2345LT-Doug-Park,"2345 Lofton Terrace","4100 - Security Patrol Dues",Security,"Security Quarterly",250.00,6.80,243.20,card,po_1N9876Xyz,succeeded,"2026-10-01 to 2026-12-31"