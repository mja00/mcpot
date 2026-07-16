CREATE TABLE "abuseipdb_checks" (
	"src_ip" "inet" PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"http_status" integer,
	"error" text,
	"is_public" boolean,
	"is_whitelisted" boolean,
	"abuse_confidence_score" integer,
	"country_code" text,
	"usage_type" text,
	"isp" text,
	"domain" text,
	"is_tor" boolean,
	"total_reports" integer,
	"num_distinct_users" integer,
	"last_reported_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "abuseipdb_daily_usage" ADD COLUMN "check_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "abuseipdb_checks_checked_at" ON "abuseipdb_checks" USING btree ("checked_at");