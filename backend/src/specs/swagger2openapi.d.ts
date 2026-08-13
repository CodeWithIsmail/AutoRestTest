/**
 * Minimal typings for `swagger2openapi`, which ships none.
 *
 * Only `convertObj` is declared — it is the single entry point we use, to
 * upgrade the Swagger 2.0 document OOPS falls back to when no JRE is available
 * for its own swagger-codegen upgrade step.
 */
declare module 'swagger2openapi' {
  export interface ConvertOptions {
    /** Patch up minor spec violations instead of rejecting the document. */
    patch?: boolean;
    /** Collect problems in `warnings` rather than throwing. */
    warnOnly?: boolean;
    /** Target OpenAPI version, e.g. "3.0.0". */
    targetVersion?: string;
    [key: string]: unknown;
  }

  export interface ConvertResult {
    /** The converted OpenAPI 3 document. */
    openapi: Record<string, unknown>;
    warnings?: string[];
    [key: string]: unknown;
  }

  export function convertObj(
    schema: Record<string, unknown>,
    options: ConvertOptions,
  ): Promise<ConvertResult>;
}
