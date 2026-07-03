-- CreateTable
CREATE TABLE "request_logs" (
    "id" TEXT NOT NULL,
    "testSuiteId" TEXT NOT NULL,
    "endpointId" TEXT,
    "seq" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "requestHeaders" JSONB,
    "requestBody" TEXT,
    "requestTruncated" BOOLEAN NOT NULL DEFAULT false,
    "responseHeaders" JSONB,
    "responseBody" TEXT,
    "responseTruncated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_logs_testSuiteId_endpointId_idx" ON "request_logs"("testSuiteId", "endpointId");

-- CreateIndex
CREATE INDEX "request_logs_testSuiteId_statusCode_idx" ON "request_logs"("testSuiteId", "statusCode");

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "test_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
