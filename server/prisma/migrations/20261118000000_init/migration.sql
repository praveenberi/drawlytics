-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DrawFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DrawStatus" AS ENUM ('PENDING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PerformanceStatus" AS ENUM ('PENDING', 'EVALUATED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "country_name" VARCHAR(120) NOT NULL,
    "country_code" VARCHAR(3) NOT NULL,
    "currency" VARCHAR(8),
    "timezone" VARCHAR(64) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,

    CONSTRAINT "lottery_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotteries" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "category_id" UUID,
    "lottery_name" VARCHAR(160) NOT NULL,
    "state_region" VARCHAR(120),
    "provider" VARCHAR(160) NOT NULL,
    "currency" VARCHAR(8),
    "description" TEXT,
    "website_url" TEXT,
    "draw_frequency" "DrawFrequency" NOT NULL DEFAULT 'WEEKLY',
    "draw_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "draw_time" VARCHAR(5),
    "timezone" VARCHAR(64) NOT NULL,
    "rules_json" JSONB NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lotteries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_draws" (
    "id" UUID NOT NULL,
    "lottery_id" UUID NOT NULL,
    "draw_date" DATE NOT NULL,
    "draw_reference" VARCHAR(64),
    "main_numbers" JSONB NOT NULL,
    "bonus_numbers" JSONB NOT NULL DEFAULT '[]',
    "status" "DrawStatus" NOT NULL DEFAULT 'PUBLISHED',
    "remarks" TEXT,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lottery_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_algorithms" (
    "id" UUID NOT NULL,
    "algorithm_name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "algorithm_type" VARCHAR(40) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "prediction_algorithms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_formulas" (
    "id" UUID NOT NULL,
    "lottery_id" UUID NOT NULL,
    "formula_name" VARCHAR(120) NOT NULL,
    "formula_config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" UUID NOT NULL,
    "reference_id" VARCHAR(32) NOT NULL,
    "lottery_id" UUID NOT NULL,
    "formula_id" UUID,
    "user_id" UUID,
    "suggested_numbers" JSONB NOT NULL,
    "bonus_numbers" JSONB NOT NULL DEFAULT '[]',
    "analysis_period" VARCHAR(60) NOT NULL,
    "target_draw_date" DATE,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluated_at" TIMESTAMP(3),
    "evaluated_draw_id" UUID,
    "matched_numbers" INTEGER,
    "matched_bonus" INTEGER,
    "performance_status" "PerformanceStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_uploads" (
    "id" UUID NOT NULL,
    "lottery_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "total_records" INTEGER NOT NULL,
    "successful_records" INTEGER NOT NULL,
    "failed_records" INTEGER NOT NULL,
    "summary" JSONB,
    "error_report" JSONB,
    "upload_status" "UploadStatus" NOT NULL,
    "uploaded_by" UUID,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64),
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "countries_country_name_key" ON "countries"("country_name");

-- CreateIndex
CREATE UNIQUE INDEX "countries_country_code_key" ON "countries"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_categories_name_key" ON "lottery_categories"("name");

-- CreateIndex
CREATE INDEX "lotteries_country_id_idx" ON "lotteries"("country_id");

-- CreateIndex
CREATE INDEX "lotteries_category_id_idx" ON "lotteries"("category_id");

-- CreateIndex
CREATE INDEX "lotteries_status_idx" ON "lotteries"("status");

-- CreateIndex
CREATE INDEX "lotteries_provider_idx" ON "lotteries"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "lotteries_country_id_lottery_name_key" ON "lotteries"("country_id", "lottery_name");

-- CreateIndex
CREATE INDEX "lottery_draws_lottery_id_draw_date_idx" ON "lottery_draws"("lottery_id", "draw_date" DESC);

-- CreateIndex
CREATE INDEX "lottery_draws_status_idx" ON "lottery_draws"("status");

-- CreateIndex
CREATE INDEX "lottery_draws_draw_date_idx" ON "lottery_draws"("draw_date");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_draws_lottery_id_draw_date_key" ON "lottery_draws"("lottery_id", "draw_date");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_draws_lottery_id_draw_reference_key" ON "lottery_draws"("lottery_id", "draw_reference");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_algorithms_algorithm_type_key" ON "prediction_algorithms"("algorithm_type");

-- CreateIndex
CREATE INDEX "prediction_formulas_lottery_id_is_active_idx" ON "prediction_formulas"("lottery_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_formulas_lottery_id_formula_name_version_key" ON "prediction_formulas"("lottery_id", "formula_name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "predictions_reference_id_key" ON "predictions"("reference_id");

-- CreateIndex
CREATE INDEX "predictions_lottery_id_performance_status_idx" ON "predictions"("lottery_id", "performance_status");

-- CreateIndex
CREATE INDEX "predictions_user_id_generated_at_idx" ON "predictions"("user_id", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "predictions_formula_id_idx" ON "predictions"("formula_id");

-- CreateIndex
CREATE INDEX "bulk_uploads_lottery_id_idx" ON "bulk_uploads"("lottery_id");

-- CreateIndex
CREATE INDEX "bulk_uploads_uploaded_at_idx" ON "bulk_uploads"("uploaded_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "lotteries" ADD CONSTRAINT "lotteries_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotteries" ADD CONSTRAINT "lotteries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "lottery_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_draws" ADD CONSTRAINT "lottery_draws_lottery_id_fkey" FOREIGN KEY ("lottery_id") REFERENCES "lotteries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_draws" ADD CONSTRAINT "lottery_draws_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_formulas" ADD CONSTRAINT "prediction_formulas_lottery_id_fkey" FOREIGN KEY ("lottery_id") REFERENCES "lotteries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_formulas" ADD CONSTRAINT "prediction_formulas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_lottery_id_fkey" FOREIGN KEY ("lottery_id") REFERENCES "lotteries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "prediction_formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_evaluated_draw_id_fkey" FOREIGN KEY ("evaluated_draw_id") REFERENCES "lottery_draws"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_uploads" ADD CONSTRAINT "bulk_uploads_lottery_id_fkey" FOREIGN KEY ("lottery_id") REFERENCES "lotteries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_uploads" ADD CONSTRAINT "bulk_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Only one active formula per lottery (partial unique index; not expressible in Prisma schema)
CREATE UNIQUE INDEX "prediction_formulas_one_active_per_lottery" ON "prediction_formulas"("lottery_id") WHERE "is_active" = true;

-- Defensive integrity checks
ALTER TABLE "lottery_draws" ADD CONSTRAINT "lottery_draws_main_numbers_is_array" CHECK (jsonb_typeof("main_numbers") = 'array');
ALTER TABLE "lottery_draws" ADD CONSTRAINT "lottery_draws_bonus_numbers_is_array" CHECK (jsonb_typeof("bonus_numbers") = 'array');
ALTER TABLE "countries" ADD CONSTRAINT "countries_code_upper" CHECK ("country_code" = upper("country_code"));
