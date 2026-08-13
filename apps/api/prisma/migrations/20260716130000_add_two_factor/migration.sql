-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "require_2fa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "backup_codes" JSONB,
ADD COLUMN     "email_otp_attempts" INTEGER,
ADD COLUMN     "email_otp_expires_at" TIMESTAMP(3),
ADD COLUMN     "email_otp_hash" TEXT,
ADD COLUMN     "totp_enabled_at" TIMESTAMP(3),
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_secret" TEXT;

