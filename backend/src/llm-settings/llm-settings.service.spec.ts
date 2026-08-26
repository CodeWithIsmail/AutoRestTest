import { ConfigService } from '@nestjs/config';
import { LlmScope } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LlmSettingsService } from './llm-settings.service';

function cfg(values: Record<string, string> = {}): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('LlmSettingsService', () => {
  let prisma: {
    llmSettings: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let service: LlmSettingsService;

  beforeEach(() => {
    prisma = {
      llmSettings: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    service = new LlmSettingsService(prisma as unknown as PrismaService, cfg());
  });

  it('listAll returns all three scopes even with no rows stored', async () => {
    const rows = await service.listAll();
    expect(rows.map((r) => r.scope)).toEqual([
      LlmScope.TEST_ENGINE,
      LlmScope.SPEC_GENERATION,
      LlmScope.REPORT_EXPLANATION,
    ]);
    expect(rows.every((r) => r.apiKey === null)).toBe(true);
  });

  it('upsert sets a new apiKey and getOverride reads it back', async () => {
    let stored: Record<string, unknown> | null = null;
    prisma.llmSettings.upsert.mockImplementation(
      (args: { create: Record<string, unknown> }) => {
        stored = args.create;
        return Promise.resolve({ ...args.create, updatedAt: new Date() });
      },
    );
    prisma.llmSettings.findUnique.mockImplementation(() =>
      Promise.resolve(stored ? { ...stored } : null),
    );

    const saved = await service.upsert(LlmScope.TEST_ENGINE, {
      apiKey: 'sk-real-key',
    });
    expect(saved.apiKey).toBe('sk-real-key');

    const row = await service.getOverride(LlmScope.TEST_ENGINE);
    expect(row.apiKey).toBe('sk-real-key');
  });

  it('upsert with apiKey: null clears a previously stored key', async () => {
    prisma.llmSettings.findUnique.mockResolvedValue({
      scope: LlmScope.TEST_ENGINE,
      model: null,
      apiBase: null,
      rpmLimit: null,
      apiKey: 'sk-old-key',
      updatedAt: new Date(),
    });
    prisma.llmSettings.upsert.mockImplementation(
      (args: { update: Record<string, unknown> }) =>
        Promise.resolve({
          ...args.update,
          scope: LlmScope.TEST_ENGINE,
          updatedAt: new Date(),
        }),
    );

    const saved = await service.upsert(LlmScope.TEST_ENGINE, { apiKey: null });
    expect(saved.apiKey).toBeNull();
  });

  it('upsert omitting apiKey leaves the stored key untouched', async () => {
    prisma.llmSettings.findUnique.mockResolvedValue({
      scope: LlmScope.TEST_ENGINE,
      model: 'old-model',
      apiBase: null,
      rpmLimit: null,
      apiKey: 'sk-existing-key',
      updatedAt: new Date(),
    });
    prisma.llmSettings.upsert.mockImplementation(
      (args: { update: Record<string, unknown> }) =>
        Promise.resolve({
          ...args.update,
          scope: LlmScope.TEST_ENGINE,
          updatedAt: new Date(),
        }),
    );

    const saved = await service.upsert(LlmScope.TEST_ENGINE, {
      model: 'new-model',
    });
    expect(saved.apiKey).toBe('sk-existing-key');
    expect(saved.model).toBe('new-model');
  });

  it('getReportExplanationSettings falls back to env when no override is stored', async () => {
    service = new LlmSettingsService(
      prisma as unknown as PrismaService,
      cfg({
        LLM_ENGINE: 'env-model',
        LLM_API_BASE: 'https://env-base/',
      }),
    );
    const settings = await service.getReportExplanationSettings();
    expect(settings).toEqual({
      model: 'env-model',
      apiBase: 'https://env-base',
      apiKey: null,
      rpmLimit: 13,
    });
  });

  it('getReportExplanationSettings prefers the stored override', async () => {
    prisma.llmSettings.findUnique.mockResolvedValue({
      scope: LlmScope.REPORT_EXPLANATION,
      model: 'db-model',
      apiBase: 'https://db-base',
      rpmLimit: null,
      apiKey: 'sk-db-key',
      updatedAt: new Date(),
    });
    const settings = await service.getReportExplanationSettings();
    expect(settings).toEqual({
      model: 'db-model',
      apiBase: 'https://db-base',
      apiKey: 'sk-db-key',
      rpmLimit: 13,
    });
  });

  it('getReportExplanationSettings takes rpmLimit from the override, env, then 13', async () => {
    prisma.llmSettings.findUnique.mockResolvedValue({
      scope: LlmScope.REPORT_EXPLANATION,
      model: null,
      apiBase: null,
      rpmLimit: 7,
      apiKey: null,
      updatedAt: new Date(),
    });
    expect((await service.getReportExplanationSettings()).rpmLimit).toBe(7);

    // 0 is a real value ("no limit"), not an absent one, so it must survive.
    prisma.llmSettings.findUnique.mockResolvedValue({
      scope: LlmScope.REPORT_EXPLANATION,
      model: null,
      apiBase: null,
      rpmLimit: 0,
      apiKey: null,
      updatedAt: new Date(),
    });
    expect((await service.getReportExplanationSettings()).rpmLimit).toBe(0);

    const envService = new LlmSettingsService(
      prisma as unknown as PrismaService,
      cfg({ LLM_RPM_LIMIT: '25' }),
    );
    prisma.llmSettings.findUnique.mockResolvedValue(null);
    expect((await envService.getReportExplanationSettings()).rpmLimit).toBe(25);
  });
});
