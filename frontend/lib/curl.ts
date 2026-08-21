// Builds a copy-pasteable curl command from a captured request.

import type { RequestLogDetail } from "./types";

// Same set the backend's filterReplayHeaders() drops before a live send —
// curl recomputes Host/Content-Length/etc itself, so echoing the captured
// values would be stale or conflict with what curl sends.
const CURL_DROP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "accept-encoding",
  "proxy-connection",
]);

/** Wraps a string in single quotes for bash, escaping any embedded `'`. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Builds a `curl ...` command reproducing this captured request. */
export function buildCurlCommand(detail: RequestLogDetail): string {
  const method = detail.method.toUpperCase();
  const canHaveBody = method !== "GET" && method !== "HEAD";
  const parts = [`curl -X ${method}`, shQuote(detail.url)];

  for (const [key, value] of Object.entries(detail.requestHeaders ?? {})) {
    if (CURL_DROP_HEADERS.has(key.toLowerCase())) continue;
    parts.push(`-H ${shQuote(`${key}: ${value}`)}`);
  }

  if (canHaveBody && detail.requestBody) {
    parts.push(`--data-raw ${shQuote(detail.requestBody)}`);
  }

  let command = parts.join(" \\\n  ");
  if (detail.requestTruncated) {
    command =
      `# WARNING: the captured request body was truncated when stored;\n` +
      `# this command's body is incomplete and will not faithfully reproduce the original request.\n` +
      command;
  }
  return command;
}
