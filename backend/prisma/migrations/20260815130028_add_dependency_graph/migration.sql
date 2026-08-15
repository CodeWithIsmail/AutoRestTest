-- CreateEnum
CREATE TYPE "GraphStatus" AS ENUM ('pending', 'running', 'ready', 'failed');

-- AlterTable
ALTER TABLE "test_suites" ADD COLUMN     "dependencyGraph" JSONB;

-- CreateTable
CREATE TABLE "dependency_graphs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "GraphStatus" NOT NULL DEFAULT 'pending',
    "jobId" TEXT,
    "graph" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "dependency_graphs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dependency_graphs_projectId_key" ON "dependency_graphs"("projectId");

-- AddForeignKey
ALTER TABLE "dependency_graphs" ADD CONSTRAINT "dependency_graphs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
