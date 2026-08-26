import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectAccessService } from '../common/project-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../reports/llm.service';
import { RequestDescriptionsService } from './request-descriptions.service';

const PROJECT_ID = 'project-1';
const SUITE_ID = 'suite-1';
const USER_ID = 'user-1';

function pendingRow(id: string) {
  return {
    id,
    method: 'GET',
    path: `/things/${id}`,
    url: `http://api.test/things/${id}`,
    requestBody: null,
    statusCode: 200,
    responseBody: '{}',
  };
}

describe('RequestDescriptionsService', () => {
  let service: RequestDescriptionsService;
  let prisma: {
    testSuite: { findFirst: jest.Mock };
    requestLog: { findMany: jest.Mock; count: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { assertAccess: jest.Mock };
  let llm: {
    assertUsable: jest.Mock;
    describeRequests: jest.Mock;
    isMock: boolean;
  };

  /** Builds the service with an env overriding only the keys given. */
  function build(env: Record<string, string> = {}) {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new RequestDescriptionsService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
      llm as unknown as LlmService,
      config,
    );
  }

  beforeEach(() => {
    prisma = {
      testSuite: { findFirst: jest.fn() },
      requestLog: { findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
      // Both call sites hand $transaction an array of promises, so awaiting
      // them all is a faithful enough stand-in for a real batch.
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    llm = {
      assertUsable: jest.fn().mockResolvedValue(undefined),
      describeRequests: jest.fn(),
      isMock: false,
    };

    prisma.testSuite.findFirst.mockResolvedValue({ id: SUITE_ID });
    prisma.requestLog.update.mockResolvedValue(undefined);
    service = build();
  });

  it('rejects a suite that does not belong to the project', async () => {
    prisma.testSuite.findFirst.mockResolvedValue(null);
    await expect(
      service.describeSuite(PROJECT_ID, SUITE_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(llm.describeRequests).not.toHaveBeenCalled();
  });

  it('describes pending requests in batches and reports progress', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map(pendingRow);
    prisma.requestLog.findMany.mockResolvedValue(rows);
    llm.describeRequests.mockImplementation(
      (batch: { id: string }[]) =>
        new Map(batch.map((r) => [r.id, `describes ${r.id}`])),
    );
    // The closing $transaction counts total, then remaining.
    prisma.requestLog.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);

    const result = await service.describeSuite(PROJECT_ID, SUITE_ID, USER_ID);

    // Default batch size is 4, so 5 rows means two calls.
    expect(llm.describeRequests).toHaveBeenCalledTimes(2);
    expect(llm.describeRequests.mock.calls[0][0]).toHaveLength(4);
    expect(llm.describeRequests.mock.calls[1][0]).toHaveLength(1);
    expect(result).toEqual({
      total: 5,
      described: 5,
      remaining: 0,
      writtenNow: 5,
      usedLlm: true,
    });
  });

  it('stops after a batch comes back empty rather than burning the quota', async () => {
    prisma.requestLog.findMany.mockResolvedValue(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(pendingRow),
    );
    llm.describeRequests.mockResolvedValue(new Map());
    prisma.requestLog.count.mockResolvedValueOnce(8).mockResolvedValueOnce(8);

    const result = await service.describeSuite(PROJECT_ID, SUITE_ID, USER_ID);

    expect(llm.describeRequests).toHaveBeenCalledTimes(1);
    expect(result.writtenNow).toBe(0);
    expect(result.usedLlm).toBe(false);
    expect(result.remaining).toBe(8);
  });

  it('caps the work per invocation and leaves the rest for the next call', async () => {
    service = build({
      LLM_DESCRIBE_MAX_PER_CALL: '2',
      LLM_DESCRIBE_BATCH_SIZE: '2',
    });
    prisma.requestLog.findMany.mockResolvedValue(['a', 'b'].map(pendingRow));
    llm.describeRequests.mockImplementation(
      (batch: { id: string }[]) =>
        new Map(batch.map((r) => [r.id, `describes ${r.id}`])),
    );
    prisma.requestLog.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);

    const result = await service.describeSuite(PROJECT_ID, SUITE_ID, USER_ID);

    expect(prisma.requestLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
    expect(result.remaining).toBe(8);
    expect(result.described).toBe(2);
  });

  it('does no work and claims no LLM use when every row is described', async () => {
    prisma.requestLog.findMany.mockResolvedValue([]);
    prisma.requestLog.count.mockResolvedValueOnce(12).mockResolvedValueOnce(0);

    const result = await service.describeSuite(PROJECT_ID, SUITE_ID, USER_ID);

    expect(llm.describeRequests).not.toHaveBeenCalled();
    expect(result).toEqual({
      total: 12,
      described: 12,
      remaining: 0,
      writtenNow: 0,
      usedLlm: true,
    });
  });
});
