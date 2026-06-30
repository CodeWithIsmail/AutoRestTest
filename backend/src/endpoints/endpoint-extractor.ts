import { HttpMethod } from '../../generated/prisma/client';

/** A single operation extracted from an OpenAPI document. */
export interface ExtractedEndpoint {
  method: HttpMethod;
  path: string;
  description: string | null;
}

/** Minimal shape of the parsed OpenAPI document the extractor reads. */
export interface ParsedSpec {
  paths?: Record<string, unknown>;
}

/**
 * Maps OpenAPI (lowercase) method keys to our HttpMethod enum. Methods not in
 * this map (head, options, trace) are intentionally ignored — they aren't part
 * of the testing engine's surface and aren't in the Prisma enum.
 */
const METHOD_MAP: Record<string, HttpMethod> = {
  get: HttpMethod.GET,
  post: HttpMethod.POST,
  put: HttpMethod.PUT,
  patch: HttpMethod.PATCH,
  delete: HttpMethod.DELETE,
};

/** Shape of a single operation object we read metadata from. */
interface OperationObject {
  summary?: unknown;
  description?: unknown;
}

/**
 * Walk a parsed OpenAPI document's `paths` and return one entry per supported
 * operation (path × method). Pure — no I/O — so it is trivially testable and
 * reusable. The description prefers the operation `summary`, then its
 * `description`, else null.
 */
export function extractEndpoints(spec: ParsedSpec): ExtractedEndpoint[] {
  const paths = spec.paths;
  if (!paths || typeof paths !== 'object') {
    return [];
  }

  const endpoints: ExtractedEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }

    for (const [methodKey, operation] of Object.entries(
      pathItem as Record<string, unknown>,
    )) {
      const method = METHOD_MAP[methodKey.toLowerCase()];
      if (!method) {
        continue;
      }

      endpoints.push({
        method,
        path,
        description: describeOperation(operation),
      });
    }
  }

  return endpoints;
}

/** Pull a human-readable description from an operation object, or null. */
function describeOperation(operation: unknown): string | null {
  if (!operation || typeof operation !== 'object') {
    return null;
  }

  const op = operation as OperationObject;
  if (typeof op.summary === 'string' && op.summary.trim()) {
    return op.summary;
  }
  if (typeof op.description === 'string' && op.description.trim()) {
    return op.description;
  }
  return null;
}
