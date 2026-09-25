-- Migration number: 0021 	 2026-09-25T00:00:00.000Z
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`product_type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`source` text NOT NULL,
	`stripe_invoice_id` text,
	`stripe_subscription_id` text,
	`payment_method` text,
	`period_start` integer,
	`period_end` integer,
	`note` text,
	`recorded_by_user_id` integer,
	`created_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payments_household` ON `payments` (`household_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stripe_subscription_id` text NOT NULL,
	`household_id` integer NOT NULL,
	`product_type` text NOT NULL,
	`stripe_price_id` text NOT NULL,
	`status` text NOT NULL,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscriptions_stripe_id_unique` ON `subscriptions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_household` ON `subscriptions` (`household_id`);--> statement-breakpoint
ALTER TABLE `households` ADD `stripe_customer_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_households_stripe_customer_unique` ON `households` (`stripe_customer_id`);