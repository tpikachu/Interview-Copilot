CREATE TABLE `ai_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`direct_answer` text DEFAULT '' NOT NULL,
	`talking_points` text,
	`resume_match` text,
	`star` text,
	`clarifying_question` text,
	`risk_warning` text,
	`followup_question` text,
	`model` text DEFAULT '' NOT NULL,
	`tokens` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `detected_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `answers_question_idx` ON `ai_answers` (`question_id`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`ord` integer DEFAULT 0 NOT NULL,
	`content` text NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_profile_idx` ON `chunks` (`profile_id`);--> statement-breakpoint
CREATE TABLE `detected_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`text` text NOT NULL,
	`type` text DEFAULT 'behavioral' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`strategy` text DEFAULT '' NOT NULL,
	`transcript_chunk_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_session_idx` ON `detected_questions` (`session_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text,
	`source_path` text,
	`text` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_profile_idx` ON `documents` (`profile_id`);--> statement-breakpoint
CREATE TABLE `embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`chunk_id` text NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`vector` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chunk_id`) REFERENCES `chunks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `embeddings_chunk_id_unique` ON `embeddings` (`chunk_id`);--> statement-breakpoint
CREATE INDEX `embeddings_chunk_idx` ON `embeddings` (`chunk_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_profile_idx` ON `notes` (`profile_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_role` text DEFAULT '' NOT NULL,
	`target_company` text,
	`interview_type` text DEFAULT 'general' NOT NULL,
	`answer_style` text DEFAULT 'concise' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`resume_text` text,
	`jd_text` text,
	`parsed_resume` text,
	`parsed_jd` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`strengths` text,
	`improvements` text,
	`per_question` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_reports_session_id_unique` ON `session_reports` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`interview_type` text DEFAULT 'general' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_profile_idx` ON `sessions` (`profile_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transcript_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`speaker` text DEFAULT 'unknown' NOT NULL,
	`text` text NOT NULL,
	`is_final` integer DEFAULT 0 NOT NULL,
	`t_start` integer,
	`t_end` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transcript_session_idx` ON `transcript_chunks` (`session_id`);