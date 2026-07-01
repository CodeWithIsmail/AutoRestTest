import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';

function cfg(values: Record<string, string>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
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
    const svc = new LlmService(cfg({ LLM_MODE: 'mock' }));
    expect(svc.isMock).toBe(true);
    const out = await svc.explainFailure(CTX);
    expect(out).toContain('DELETE /pets/{id}');
    expect(out.toLowerCase()).toContain('server error');
  });

  it('assertUsable throws in real mode with no key', () => {
    const svc = new LlmService(cfg({ LLM_MODE: 'real' }));
    expect(() => svc.assertUsable()).toThrow(ServiceUnavailableException);
  });

  it('assertUsable passes in mock mode', () => {
    const svc = new LlmService(cfg({ LLM_MODE: 'mock' }));
    expect(() => svc.assertUsable()).not.toThrow();
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

    const svc = new LlmService(cfg({ LLM_MODE: 'real', LLM_API_KEY: 'k' }));
    const out = await svc.explainFailure(CTX);
    expect(out).toBe('Because the server crashed.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
  });

  it('falls back to a generic note when the API errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const svc = new LlmService(cfg({ LLM_MODE: 'real', LLM_API_KEY: 'k' }));
    const out = await svc.explainFailure(CTX);
    expect(out).toContain('DELETE /pets/{id}');
  });
});
