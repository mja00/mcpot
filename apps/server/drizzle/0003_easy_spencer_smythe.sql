CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"src_ip" "inet" NOT NULL,
	"report_day" date NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"http_status" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "abuseipdb_daily_usage" (
	"report_day" date PRIMARY KEY NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "abuse_reports_src_ip_day" ON "abuse_reports" USING btree ("src_ip","report_day");--> statement-breakpoint
CREATE INDEX "abuse_reports_day" ON "abuse_reports" USING btree ("report_day");