// Client-side OpenAPI parsing so the Endpoints screen can show per-operation
// detail (parameters, request body, auth, responses) without a backend call.
// The stored spec is raw text (YAML or JSON); YAML 1.2 is a superset of JSON, so
// one parser handles both. Internal ($ref: "#/...") references are resolved
// locally with a cycle guard; external refs are left as-is (rare in single-file
// specs).

import { parse as parseYaml } from "yaml";

export interface ParamDetail {
  name: string;
  in: string;
  required: boolean;
  type: string;
  description?: string;
}

export interface SchemaProp {
  name: string;
  type: string;
  required: boolean;
}

export interface RequestBodyDetail {
  required: boolean;
  contentTypes: string[];
  props: SchemaProp[];
  example: string | null;
}

export interface ResponseDetail {
  code: string;
  description: string;
}

export interface AuthDetail {
  required: boolean;
  schemes: string[];
}

export interface OperationDetail {
  parameters: ParamDetail[];
  requestBody: RequestBodyDetail | null;
  responses: ResponseDetail[];
  auth: AuthDetail;
}

type Dict = Record<string, unknown>;

function isObj(v: unknown): v is Dict {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse raw spec text (YAML or JSON) into a plain object, or null on failure. */
export function parseSpec(text: string): Dict | null {
  try {
    const doc = parseYaml(text);
    return isObj(doc) ? doc : null;
  } catch {
    return null;
  }
}

/** Resolve a single "#/a/b/c" JSON-pointer ref against the root document. */
function resolveRef(root: Dict, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const part of parts) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Follow a $ref (if present) one or more hops, guarding against cycles. */
function deref(root: Dict, node: unknown, seen = new Set<string>()): unknown {
  let cur = node;
  while (isObj(cur) && typeof cur.$ref === "string") {
    if (seen.has(cur.$ref)) return {};
    seen.add(cur.$ref);
    cur = resolveRef(root, cur.$ref);
  }
  return cur;
}

/** A short, human-readable type label for a resolved schema. */
function typeLabel(root: Dict, schema: unknown): string {
  const s = deref(root, schema);
  if (!isObj(s)) return "any";
  if (Array.isArray(s.enum)) return `enum(${s.enum.length})`;
  if (typeof s.type === "string") {
    if (s.type === "array") {
      const items = deref(root, s.items);
      const inner = isObj(items) && typeof items.type === "string"
        ? items.type
        : isObj(items) && items.properties
          ? "object"
          : "any";
      return `array<${inner}>`;
    }
    return s.type;
  }
  if (s.properties) return "object";
  if (Array.isArray(s.allOf) || Array.isArray(s.oneOf) || Array.isArray(s.anyOf))
    return "object";
  return "any";
}

function extractParams(root: Dict, raw: unknown): ParamDetail[] {
  if (!Array.isArray(raw)) return [];
  const out: ParamDetail[] = [];
  for (const p of raw) {
    const param = deref(root, p);
    if (!isObj(param) || typeof param.name !== "string") continue;
    out.push({
      name: param.name,
      in: typeof param.in === "string" ? param.in : "query",
      required: param.required === true || param.in === "path",
      // OAS3 nests type under schema; OAS2 has it inline.
      type: typeLabel(root, param.schema ?? param),
      description:
        typeof param.description === "string" ? param.description : undefined,
    });
  }
  return out;
}

function extractRequestBody(
  root: Dict,
  raw: unknown,
): RequestBodyDetail | null {
  const rb = deref(root, raw);
  if (!isObj(rb)) return null;
  const content = isObj(rb.content) ? rb.content : {};
  const contentTypes = Object.keys(content);
  if (contentTypes.length === 0) return null;

  // Prefer a JSON media type for the shallow schema view.
  const primaryKey =
    contentTypes.find((k) => k.includes("json")) ?? contentTypes[0];
  const media = deref(root, content[primaryKey]);
  const schema = isObj(media) ? deref(root, media.schema) : undefined;

  const props: SchemaProp[] = [];
  let example: string | null = null;

  if (isObj(media) && media.example !== undefined) {
    example = safeJson(media.example);
  }

  if (isObj(schema)) {
    if (example === null && schema.example !== undefined) {
      example = safeJson(schema.example);
    }
    // Show one level of properties (object, or array<object> items).
    const objSchema =
      schema.type === "array" ? deref(root, schema.items) : schema;
    if (isObj(objSchema) && isObj(objSchema.properties)) {
      const requiredList = Array.isArray(objSchema.required)
        ? (objSchema.required as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];
      for (const [name, propSchema] of Object.entries(objSchema.properties)) {
        props.push({
          name,
          type: typeLabel(root, propSchema),
          required: requiredList.includes(name),
        });
      }
    }
  }

  return {
    required: rb.required === true,
    contentTypes,
    props,
    example,
  };
}

function extractResponses(root: Dict, raw: unknown): ResponseDetail[] {
  if (!isObj(raw)) return [];
  const out: ResponseDetail[] = [];
  for (const [code, val] of Object.entries(raw)) {
    const resp = deref(root, val);
    out.push({
      code,
      description:
        isObj(resp) && typeof resp.description === "string"
          ? resp.description
          : "",
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

function extractAuth(
  root: Dict,
  operationSecurity: unknown,
  globalSecurity: unknown,
): AuthDetail {
  // An operation's own `security` (including an explicit []) overrides global.
  const sec =
    operationSecurity !== undefined ? operationSecurity : globalSecurity;
  if (!Array.isArray(sec) || sec.length === 0) {
    return { required: false, schemes: [] };
  }
  const schemes = new Set<string>();
  for (const requirement of sec) {
    if (isObj(requirement)) {
      for (const name of Object.keys(requirement)) schemes.add(name);
    }
  }
  return { required: true, schemes: [...schemes] };
}

/** Extract detail for one operation (by method + templated path), or null. */
export function getOperationDetail(
  root: Dict,
  method: string,
  path: string,
): OperationDetail | null {
  const paths = isObj(root.paths) ? root.paths : null;
  if (!paths) return null;
  const pathItem = deref(root, paths[path]);
  if (!isObj(pathItem)) return null;
  const operation = deref(root, pathItem[method.toLowerCase()]);
  if (!isObj(operation)) return null;

  // Path-level params apply to every operation; operation-level overrides them.
  const pathParams = extractParams(root, pathItem.parameters);
  const opParams = extractParams(root, operation.parameters);
  const merged = new Map<string, ParamDetail>();
  for (const p of pathParams) merged.set(`${p.in}:${p.name}`, p);
  for (const p of opParams) merged.set(`${p.in}:${p.name}`, p);

  return {
    parameters: [...merged.values()],
    requestBody: extractRequestBody(root, operation.requestBody),
    responses: extractResponses(root, operation.responses),
    auth: extractAuth(root, operation.security, root.security),
  };
}

function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}
