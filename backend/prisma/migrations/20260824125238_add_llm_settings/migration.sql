-- CreateEnum
CREATE TYPE "LlmScope" AS ENUM ('TEST_ENGINE', 'SPEC_GENERATION', 'REPORT_EXPLANATION');

-- CreateTable
CREATE TABLE "llm_settings" (
    "id" TEXT NOT NULL,
    "scope" "LlmScope" NOT NULL,
    "model" TEXT,
    "apiBase" TEXT,
    "rpmLimit" INTEGER,
    "maxTokens" INTEGER,
    "creativeTemperature" DOUBLE PRECISION,
    "strictTemperature" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_settings_scope_key" ON "llm_settings"("scope");
