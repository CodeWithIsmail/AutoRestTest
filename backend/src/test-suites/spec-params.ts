import { Logger } from '@nestjs/common';
import SwaggerParser from '@apidevtools/swagger-parser';
import * as yaml from 'js-yaml';

/**
 * A single declared parameter or body property, reduced to what tells a reader
 * what a test was *aiming* at. Descriptions, examples and vendor extensions are
 * dropped: they cost prompt budget and never change the intent of a request.
 */
export interface DeclaredField {
  name: string;
  /** 'path' | 'query' | 'header' | 'cookie' | 'body' */
  in: string;
  type?: string;
  required?: boolean;
  format?: string;
  enum?: unknown[];
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
}

/** What one operation declares, as handed to the LLM. */
export interface OperationSpec {
  summary?: string;
  fields: DeclaredField[];
  contentTypes?: string[];
  requiresAuth?: boolean;
}

/** Keyed by `${METHOD}:${templatedPath}` — the same key request logs match on. */
export type SpecIndex = Map<string, OperationSpec>;

const logger = new Logger('SpecParams');

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];

/** Constraints worth carrying; anything else is noise for this purpose. */
const CONSTRAINTS = [
  'format',
  'enum',
  'maxLength',
  'minLength',
  'minimum',
  'maximum',
] as const;

/** Cap on fields per operation, so one fat schema cannot dominate a prompt. */
const MAX_FIELDS = 25;

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Parse an OpenAPI document and index every operation's declared parameters.
 *
 * Never throws: a spec that will not parse simply yields an empty index, and
 * the describe pass carries on without the constraint block. A bad spec should
 * degrade the descriptions, not fail the run's request list.
 */
export async function buildSpecIndex(raw: string | null): Promise<SpecIndex> {
  const index: SpecIndex = new Map();
  if (!raw?.trim()) return index;

  let doc: unknown;
  try {
    // js-yaml reads JSON too (JSON is a subset of YAML), so one path covers both.
    doc = yaml.load(raw);
    // Clone first: the parser mutates what it is given. Dereferencing is what
    // makes $ref'd parameter and body schemas readable here at all.
    doc = await SwaggerParser.dereference(structuredClone(doc) as never);
  } catch (err) {
    logger.warn(`Could not parse the spec for descriptions: ${String(err)}`);
    return index;
  }

  if (!isObj(doc) || !isObj(doc.paths)) return index;

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!isObj(pathItem)) continue;
    // Parameters declared once for the whole path apply to every operation.
    const shared = isObj(pathItem) ? pathItem.parameters : undefined;

    for (const method of METHODS) {
      const op = pathItem[method];
      if (!isObj(op)) continue;
      index.set(
        `${method.toUpperCase()}:${path}`,
        operationSpec(op, shared, doc),
      );
    }
  }

  return index;
}

function operationSpec(op: Json, shared: unknown, doc: Json): OperationSpec {
  const fields: DeclaredField[] = [];

  const params: unknown[] = [
    ...(Array.isArray(shared) ? (shared as unknown[]) : []),
    ...(Array.isArray(op.parameters) ? (op.parameters as unknown[]) : []),
  ];
  for (const p of params) {
    if (!isObj(p) || typeof p.name !== 'string') continue;
    fields.push({
      name: p.name,
      in: typeof p.in === 'string' ? p.in : 'query',
      required: p.required === true || undefined,
      ...constraintsOf(isObj(p.schema) ? p.schema : {}),
    });
  }

  const { contentTypes, bodyFields } = bodyOf(op);
  fields.push(...bodyFields);

  // `security: []` on an operation explicitly opts out of a global requirement.
  const opSec = op.security;
  const requiresAuth = Array.isArray(opSec)
    ? opSec.length > 0
    : Array.isArray(doc.security) && doc.security.length > 0;

  return {
    summary: typeof op.summary === 'string' ? op.summary : undefined,
    fields: fields.slice(0, MAX_FIELDS),
    contentTypes: contentTypes.length ? contentTypes : undefined,
    requiresAuth: requiresAuth || undefined,
  };
}

function bodyOf(op: Json): {
  contentTypes: string[];
  bodyFields: DeclaredField[];
} {
  const body = isObj(op.requestBody) ? op.requestBody : null;
  const content = body && isObj(body.content) ? body.content : null;
  if (!content) return { contentTypes: [], bodyFields: [] };

  const contentTypes = Object.keys(content);
  // The declared media types matter as a set (a swapped Content-Type is a
  // mutation), but only one schema is needed to name the body's fields.
  const first = content[contentTypes[0]];
  const schema = isObj(first) && isObj(first.schema) ? first.schema : null;
  if (!schema) return { contentTypes, bodyFields: [] };

  const props = isObj(schema.properties) ? schema.properties : null;
  if (!props) return { contentTypes, bodyFields: [] };

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((r): r is string => typeof r === 'string')
      : [],
  );

  const bodyFields = Object.entries(props).map(([name, sub]) => ({
    name,
    in: 'body',
    required: required.has(name) || undefined,
    ...constraintsOf(isObj(sub) ? sub : {}),
  }));

  return { contentTypes, bodyFields };
}

/** Pull `type` plus any declared constraint, skipping what is absent. */
function constraintsOf(schema: Json): Partial<DeclaredField> {
  const out: Partial<DeclaredField> = {};
  if (typeof schema.type === 'string') out.type = schema.type;
  for (const key of CONSTRAINTS) {
    const value = schema[key];
    if (value === undefined || value === null) continue;
    // Long enums are a wall of text; the first handful conveys the shape.
    if (key === 'enum') {
      out.enum = Array.isArray(value) ? value.slice(0, 10) : undefined;
      continue;
    }
    Object.assign(out, { [key]: value });
  }
  return out;
}
