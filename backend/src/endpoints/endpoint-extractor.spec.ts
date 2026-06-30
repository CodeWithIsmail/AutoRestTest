import { HttpMethod } from '../../generated/prisma/client';
import { extractEndpoints } from './endpoint-extractor';

describe('extractEndpoints', () => {
  it('extracts one entry per path × supported method', () => {
    const result = extractEndpoints({
      paths: {
        '/users': {
          get: { summary: 'List users' },
          post: { summary: 'Create user' },
        },
        '/users/{id}': {
          get: {},
          delete: {},
        },
      },
    });

    expect(result).toHaveLength(4);
    expect(result).toContainEqual({
      method: HttpMethod.GET,
      path: '/users',
      description: 'List users',
    });
    expect(result).toContainEqual({
      method: HttpMethod.DELETE,
      path: '/users/{id}',
      description: null,
    });
  });

  it('maps lowercase OpenAPI methods to the HttpMethod enum', () => {
    const result = extractEndpoints({
      paths: {
        '/a': { get: {}, post: {}, put: {}, patch: {}, delete: {} },
      },
    });

    expect(result.map((e) => e.method).sort()).toEqual(
      [
        HttpMethod.DELETE,
        HttpMethod.GET,
        HttpMethod.PATCH,
        HttpMethod.POST,
        HttpMethod.PUT,
      ].sort(),
    );
  });

  it('ignores unsupported method keys (head, options, trace) and non-method keys', () => {
    const result = extractEndpoints({
      paths: {
        '/a': {
          get: {},
          head: {},
          options: {},
          trace: {},
          parameters: [{ name: 'x' }],
          summary: 'path-level summary',
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].method).toBe(HttpMethod.GET);
  });

  it('prefers summary, then description, else null', () => {
    const result = extractEndpoints({
      paths: {
        '/a': { get: { summary: 'S', description: 'D' } },
        '/b': { get: { description: 'only description' } },
        '/c': { get: { summary: '   ' } },
      },
    });

    const byPath = Object.fromEntries(
      result.map((e) => [e.path, e.description]),
    );
    expect(byPath['/a']).toBe('S');
    expect(byPath['/b']).toBe('only description');
    expect(byPath['/c']).toBeNull();
  });

  it('returns an empty array when paths is missing, empty, or malformed', () => {
    expect(extractEndpoints({})).toEqual([]);
    expect(extractEndpoints({ paths: {} })).toEqual([]);
    expect(extractEndpoints({ paths: undefined })).toEqual([]);
    expect(
      extractEndpoints({ paths: { '/a': null as unknown as object } }),
    ).toEqual([]);
  });
});
