CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`company` text,
	`jd_text` text,
	`parsed_jd` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_profile_idx` ON `jobs` (`profile_id`);--> statement-breakpoint
ALTER TABLE `chunks` ADD `job_id` text REFERENCES jobs(id);--> statement-breakpoint
ALTER TABLE `sessions` ADD `job_id` text REFERENCES jobs(id);