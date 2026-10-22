ALTER TABLE "users" ADD COLUMN "color_mode" VARCHAR(5) NOT NULL DEFAULT 'light';
ALTER TABLE "users" ADD CONSTRAINT "users_color_mode_check" CHECK ("color_mode" IN ('light', 'dark'));
