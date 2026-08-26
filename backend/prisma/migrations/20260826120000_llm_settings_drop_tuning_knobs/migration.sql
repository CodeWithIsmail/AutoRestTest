-- The admin LLM settings page now exposes exactly four fields per scope
-- (model, API base, API key, RPM limit). The tuning knobs below were only ever
-- read by the test engine, and engine-service already substitutes its own
-- defaults when they are absent, so they are dropped rather than left as
-- invisible overrides with no UI.
--
-- Data note: TEST_ENGINE held maxTokens=15000 and both temperatures=1. The
-- engine-service fallbacks are 16384 and 1.0/1.0, so no behaviour is lost.

-- AlterTable
ALTER TABLE "llm_settings" DROP COLUMN "maxTokens",
DROP COLUMN "creativeTemperature",
DROP COLUMN "strictTemperature";
