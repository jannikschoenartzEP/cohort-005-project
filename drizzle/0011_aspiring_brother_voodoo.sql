ALTER TABLE `coupons` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `progress_choice` text;--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `decline_reason` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `decline_reason_text` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `refund_state` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `failed_note` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `refund_state_changed_at` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `refund_state_changed_by_user_id` integer REFERENCES users(id);