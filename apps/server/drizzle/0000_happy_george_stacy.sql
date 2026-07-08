CREATE TABLE "connections" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"daemon_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_at" timestamp with time zone,
	"src_ip" "inet",
	"src_port" integer,
	"protocol_version" integer,
	"server_address" text,
	"server_port" integer,
	"intent" text NOT NULL,
	"ping_completed" boolean DEFAULT false NOT NULL,
	"username" text,
	"player_uuid" text,
	"fingerprint" text
);
--> statement-breakpoint
CREATE TABLE "daemons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" text NOT NULL,
	"hostname" text,
	"api_key_hash" text NOT NULL,
	"api_key_prefix" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"persona" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"config_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"queue_depth" integer,
	"uptime_seconds" integer,
	CONSTRAINT "daemons_machine_id_unique" UNIQUE("machine_id")
);
--> statement-breakpoint
CREATE TABLE "enrollment_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"single_use" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"used_by_daemon" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_daemon_id_daemons_id_fk" FOREIGN KEY ("daemon_id") REFERENCES "public"."daemons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_used_by_daemon_daemons_id_fk" FOREIGN KEY ("used_by_daemon") REFERENCES "public"."daemons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_daemon_ts" ON "connections" USING btree ("daemon_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "connections_srcip_ts" ON "connections" USING btree ("src_ip","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "connections_intent_ts" ON "connections" USING btree ("intent","received_at" DESC NULLS LAST);