import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EngineService } from './engine.service';

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('EngineService', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function ok(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(''),
    } as unknown as Response;
  }

  it('strips a trailing slash from the base URL and posts a run', async () => {
    fetchMock.mockResolvedValue(
      ok({ jobId: 'j1', status: 'pending', error: null }),
    );
    const svc = new EngineService(
      makeConfig({ ENGINE_SERVICE_URL: 'http://engine:5000/' }),
    );

    const job = await svc.startRun({
      spec: 'openapi: 3.0.0',
      targetUrl: 'http://x:8080',
      timeBudget: 60,
      mutationRate: 0.2,
    });

    expect(job.jobId).toBe('j1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://engine:5000/runs');
    expect(init.method).toBe('POST');
  });

  it('sends the service token header when configured', async () => {
    fetchMock.mockResolvedValue(
      ok({ jobId: 'j', status: 'running', error: null }),
    );
    const svc = new EngineService(
      makeConfig({
        ENGINE_SERVICE_URL: 'http://engine:5000',
        ENGINE_SERVICE_TOKEN: 's3cret',
      }),
    );

    await svc.getStatus('j');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Service-Token']).toBe('s3cret');
  });

  it('maps a network failure to 503', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new EngineService(makeConfig({}));

    await expect(svc.getStatus('j')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('maps a non-2xx engine response to 503', async () => {
    fetchMock.mockResolvedValue(ok({}, 500));
    const svc = new EngineService(makeConfig({}));

    await expect(svc.getResult('j')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
