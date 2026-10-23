CREATE TABLE "frontend_error_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "request_id" VARCHAR(36) NOT NULL,
    "client_request_id" VARCHAR(128),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_type" VARCHAR(32) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "stack" TEXT,
    "route" VARCHAR(512) NOT NULL,
    "api_path" VARCHAR(512),
    "api_method" VARCHAR(10),
    "api_status" INTEGER,
    "user_agent" VARCHAR(1024),
    "device" JSONB,
    "logs" JSONB,
    CONSTRAINT "frontend_error_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "frontend_error_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "frontend_error_reports_created_at_idx" ON "frontend_error_reports"("created_at");
CREATE INDEX "frontend_error_reports_user_created_at_idx" ON "frontend_error_reports"("user_id", "created_at");
CREATE INDEX "frontend_error_reports_type_created_at_idx" ON "frontend_error_reports"("event_type", "created_at");
