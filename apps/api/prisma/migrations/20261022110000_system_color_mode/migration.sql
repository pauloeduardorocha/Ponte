ALTER TABLE "users" DROP CONSTRAINT "users_color_mode_check";
ALTER TABLE "users" ALTER COLUMN "color_mode" TYPE VARCHAR(6);
ALTER TABLE "users" ALTER COLUMN "color_mode" SET DEFAULT 'system';
ALTER TABLE "users" ADD CONSTRAINT "users_color_mode_check" CHECK ("color_mode" IN ('system', 'light', 'dark'));
