CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`situation` text DEFAULT '' NOT NULL,
	`task` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`competencies` text,
	`skills` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stories_profile_idx` ON `stories` (`profile_id`);