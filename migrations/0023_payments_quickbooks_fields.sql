ALTER TABLE `payments` ADD `stripe_charge_id` text;
ALTER TABLE `payments` ADD `payout_id` text;
ALTER TABLE `payments` ADD `status` text DEFAULT 'succeeded' NOT NULL;
