-- CreateEnum
CREATE TYPE "TestRunType" AS ENUM ('generated', 'replay');

-- AlterTable
ALTER TABLE "test_suites" ADD COLUMN     "originSuiteId" TEXT,
ADD COLUMN     "runType" "TestRunType" NOT NULL DEFAULT 'generated';

-- AddForeignKey
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_originSuiteId_fkey" FOREIGN KEY ("originSuiteId") REFERENCES "test_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
