-- AlterTable
ALTER TABLE "test_suites" ADD COLUMN     "excludedEndpointIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
