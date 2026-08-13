-- CreateEnum
CREATE TYPE "SpecGenStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "spec_generations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" "SpecGenStatus" NOT NULL DEFAULT 'pending',
    "sourceName" TEXT NOT NULL,
    "step" TEXT,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "stepTotal" INTEGER NOT NULL DEFAULT 9,
    "generatedSpec" TEXT,
    "warnings" TEXT[],
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "spec_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spec_generations_projectId_key" ON "spec_generations"("projectId");

-- AddForeignKey
ALTER TABLE "spec_generations" ADD CONSTRAINT "spec_generations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
