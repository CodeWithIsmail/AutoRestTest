import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmSettingsService } from '../llm-settings/llm-settings.service';
import { LlmService } from './llm.service';

function cfg(values: Record<string, string>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

/** No admin override — resolves to the same defaults the old constructor used. */
function llmSettings(): LlmSettingsService {
  return {
    getReportExplanationSettings: () =>
      Promise.resolve({
        model: 'google/gemini-2.5-flash-lite',
        apiBase: 'https://openrouter.ai/api/v1',
        apiKey: null,
        rpmLimit: 0,
      }),
  } as unknown as LlmSettingsService;
}

const CTX = {
  method: 'DELETE',
  path: '/pets/{id}',
  statusCodes: { '500': 3 },
  serverErrors: [{ status_code: 500 }],
};

describe('LlmService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns a deterministic mock explanation in mock mode', async () => {
    const svc = new LlmService(cfg({ LLM_MODE: 'mock' }), llmSettings());
    expect(svc.isMock).toBe(true);
    const out = await svc.explainFailure(CTX);
    expect(out).toContain('DELETE /pets/{id}');
    expect(out.toLowerCase()).toContain('server error');
  });

  it('assertUsable throws in real mode with no key', async () => {
    const svc = new LlmService(cfg({ LLM_MODE: 'real' }), llmSettings());
    await expect(svc.assertUsable()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('assertUsable passes in mock mode', async () => {
    const svc = new LlmService(cfg({ LLM_MODE: 'mock' }), llmSettings());
    await expect(svc.assertUsable()).resolves.not.toThrow();
  });

  it('assertUsable passes when the admin settings page has a key', async () => {
    const withKey = {
      getReportExplanationSettings: () =>
        Promise.resolve({
          model: 'm',
          apiBase: 'https://x',
          apiKey: 'admin-key',
          rpmLimit: 0,
        }),
    } as unknown as LlmSettingsService;
    const svc = new LlmService(cfg({ LLM_MODE: 'real' }), withKey);
    await expect(svc.assertUsable()).resolves.not.toThrow();
  });

  it('parses a real chat completion', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            { message: { content: '  Because the server crashed.  ' } },
          ],
        }),
      text: () => Promise.resolve(''),
    });
    global.fetch = fetchMock;

    const svc = new LlmService(
      cfg({ LLM_MODE: 'real', LLM_API_KEY: 'k' }),
      llmSettings(),
    );
    const out = await svc.explainFailure(CTX);
    expect(out).toBe('Because the server crashed.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
  });

  it('spaces requests apart to honour the RPM limit for the scope', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 'x' } }] }),
      text: () => Promise.resolve(''),
    });
    // 600 rpm == one call per 100ms: long enough to measure, short enough that
    // the test stays fast. The same arithmetic gives ~4.6s at the default 13.
    const paced = {
      getReportExplanationSettings: () =>
        Promise.resolve({
          model: 'm',
          apiBase: 'https://x',
          apiKey: 'k',
          rpmLimit: 600,
        }),
    } as unknown as LlmSettingsService;

    const svc = new LlmService(cfg({ LLM_MODE: 'real' }), paced);
    const started = Date.now();
    await svc.explainFailure(CTX);
    await svc.explainFailure(CTX);
    expect(Date.now() - started).toBeGreaterThanOrEqual(95);
  });

  it('shares one rate budget between explanations and descriptions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '{"results":[{"id":"a","description":"d"}]}',
              },
            },
          ],
        }),
      text: () => Promise.resolve(''),
    });
    const paced = {
      getReportExplanationSettings: () =>
        Promise.resolve({
          model: 'm',
          apiBase: 'https://x',
          apiKey: 'k',
          rpmLimit: 600,
        }),
    } as unknown as LlmSettingsService;

    const svc = new LlmService(cfg({ LLM_MODE: 'real' }), paced);
    const started = Date.now();
    // One of each: they share a key, so they must share the budget too.
    await svc.explainFailure(CTX);
    await svc.describeRequests([
      {
        id: 'a',
        method: 'GET',
        path: '/pets',
        url: 'https://api/pets',
        requestBody: null,
        statusCode: 200,
        responseBody: null,
      },
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(95);
  });

  it('does not pace at all when the RPM limit is 0', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 'x' } }] }),
      text: () => Promise.resolve(''),
    });
    const svc = new LlmService(cfg({ LLM_MODE: 'real' }), llmSettings());
    const started = Date.now();
    await svc.explainFailure(CTX);
    await svc.explainFailure(CTX);
    await svc.explainFailure(CTX);
    expect(Date.now() - started).toBeLessThan(50);
  });

  describe('describeRequests prompt', () => {
    /** Runs one describe call and hands back the user message that was sent. */
    async function promptFor(
      input: Partial<Parameters<LlmService['describeRequests']>[0][0]>,
    ): Promise<string> {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"results":[]}' } }],
          }),
        text: () => Promise.resolve(''),
      });
      global.fetch = fetchMock;

      const svc = new LlmService(
        cfg({ LLM_MODE: 'real', LLM_API_KEY: 'k' }),
        llmSettings(),
      );
      await svc.describeRequests([
        {
          id: 'r1',
          method: 'PUT',
          path: '/pets/%20fluffy%20',
          url: 'http://api.test/pets/%20fluffy%20?limit=99999',
          requestHeaders: { 'Content-Type': 'text/plain', Host: 'api.test' },
          requestBody: '{"name":""}',
          endpointMethod: 'PUT',
          endpointPath: '/pets/{slug}',
          spec: {
            fields: [
              { name: 'slug', in: 'path', type: 'string', maxLength: 20 },
              { name: 'name', in: 'body', type: 'string', required: true },
            ],
          },
          ...input,
        },
      ]);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        messages: { role: string; content: string }[];
      };
      return body.messages[1].content;
    }

    it('names path parameters using the templated path, decoded', async () => {
      const prompt = await promptFor({});
      // Without the template the parameter has no name at all — this is the
      // difference between "spaces in the path" and "spaces in path_params.slug".
      expect(prompt).toContain('PUT /pets/{slug}');
      expect(prompt).toContain('path_params');
      expect(prompt).toContain('" fluffy "');
      expect(prompt).toContain('query_params');
      expect(prompt).toContain('99999');
    });

    it('carries the declared constraints from the spec', async () => {
      const prompt = await promptFor({});
      expect(prompt).toContain('maxLength');
      expect(prompt).toContain('slug');
      expect(prompt).toContain('required');
    });

    it('never sends the response, so descriptions cannot describe outcomes', async () => {
      const prompt = await promptFor({});
      expect(prompt).not.toContain('statusCode');
      expect(prompt).not.toContain('responseBody');
    });

    it('keeps intent-bearing headers and drops transport noise', async () => {
      const prompt = await promptFor({
        requestHeaders: {
          Authorization: 'Bearer super-secret-token',
          'Content-Type': 'text/plain',
          Host: 'api.test',
          Connection: 'keep-alive',
        },
      });
      expect(prompt).toContain('text/plain');
      // Whether a token was sent is the signal; the token itself must not leave.
      expect(prompt).toContain('present');
      expect(prompt).not.toContain('super-secret-token');
      expect(prompt).not.toContain('keep-alive');
    });

    it('flags an unmatched request instead of inventing a template', async () => {
      const prompt = await promptFor({
        method: 'DELETE',
        endpointMethod: null,
        endpointPath: null,
        spec: null,
      });
      expect(prompt).toContain('no declared operation matches');
      expect(prompt).not.toContain('{slug}');
    });
  });

  it('falls back to a generic note when the API errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const svc = new LlmService(
      cfg({ LLM_MODE: 'real', LLM_API_KEY: 'k' }),
      llmSettings(),
    );
    const out = await svc.explainFailure(CTX);
    expect(out).toContain('DELETE /pets/{id}');
  });
});
