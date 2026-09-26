-- Migration number: 0024 	 2026-09-26T00:00:00.000Z
-- Collapse duplicate rows created by the invoice.payment_succeeded / invoice.paid race
-- (keep the earliest row per stripe_invoice_id) before the unique index can be created.
DELETE FROM payments
WHERE stripe_invoice_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM payments WHERE stripe_invoice_id IS NOT NULL GROUP BY stripe_invoice_id
  );
CREATE UNIQUE INDEX `idx_payments_stripe_invoice_id_unique` ON `payments` (`stripe_invoice_id`);
