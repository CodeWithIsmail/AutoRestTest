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
    requestHeaders: null,
    requestBody: null,
    endpoint: { method: 'GET', path: '/things/{id}' },
  };
}

describe('RequestDescriptionsService', () => {
  let service: RequestDescriptionsService;
  let prisma: {
    testSuite: { findFirst: jest.Mock };
    requestLog: { findMany: jest.Mock; count: jest.Mock; update: jest.Mock };
    apiSpecification: { findUnique: jest.Mock };
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
      apiSpecification: { findUnique: jest.fn().mockResolvedValue(null) },
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

  it('fetches pending rows grouped by operation, with the template and headers', async () => {
    prisma.requestLog.findMany.mockResolvedValue([]);
    prisma.requestLog.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await service.describeSuite(PROJECT_ID, SUITE_ID, USER_ID);

    const findManyCalls = prisma.requestLog.findMany.mock.calls as [
      { orderBy: unknown; select: Record<string, unknown> },
    ][];
    const args = findManyCalls[0][0];
    // Same-endpoint requests must land in the same batch: that contrast is what
    // lets the model see which field was mutated.
    expect(args.orderBy).toEqual([{ endpointId: 'asc' }, { seq: 'asc' }]);
    // The templated path is the whole reason a description can name a parameter.
    expect(args.select.endpoint).toEqual({
      select: { method: true, path: true },
    });
    expect(args.select.requestHeaders).toBe(true);
    // The response is deliberately not fetched — it is not part of the intent.
    expect(args.select.responseBody).toBeUndefined();
    expect(args.select.statusCode).toBeUndefined();
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
    const calls = llm.describeRequests.mock.calls as [{ id: string }[]][];
    expect(calls[0][0]).toHaveLength(4);
    expect(calls[1][0]).toHaveLength(1);
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

  it('returns early once the time budget is spent, leaving the rest pending', async () => {
    // 5s is the floor the clamp allows; each batch is made to burn past it so
    // the loop stops after the first, however many rows were fetched.
    service = build({
      LLM_DESCRIBE_MAX_SECONDS: '5',
      LLM_DESCRIBE_BATCH_SIZE: '2',
    });
    prisma.requestLog.findMany.mockResolvedValue(
      ['a', 'b', 'c', 'd', 'e', 'f'].map(pendingRow),
    );

    const realNow = Date.now;
    let clock = realNow();
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    llm.describeRequests.mockImplementation((batch: { id: string }[]) => {
      clock += 6_000; // one batch, budget blown
      return new Map(batch.map((r) => [r.id, `describes ${r.id}`]));
    });
    prisma.requestLog.count.mockResolvedValueOnce(6).mockResolvedValueOnce(4);

    const result = await service.describeSuite(PROJECT_ID, SUITE_ID, USER_ID);
    Date.now = realNow;

    expect(llm.describeRequests).toHaveBeenCalledTimes(1);
    expect(result.writtenNow).toBe(2);
    expect(result.remaining).toBe(4);
    expect(result.usedLlm).toBe(true);
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
