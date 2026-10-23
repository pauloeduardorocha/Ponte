ALTER TABLE "users"
  ADD COLUMN "push_event_refund_requested" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "push_library_overdue" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "push_library_reservation_ready" BOOLEAN NOT NULL DEFAULT true;
