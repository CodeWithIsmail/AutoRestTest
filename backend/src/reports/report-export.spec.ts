import { HttpMethod, SuiteStatus } from '../../generated/prisma/client';
import { reportToCsv, reportToPdf } from './report-export';
import { SuiteReport } from './reports.service';

const REPORT: SuiteReport = {
  overview: {
    suiteId: 'suite-1',
    name: 'Nightly',
    status: SuiteStatus.completed,
    targetUrl: 'http://localhost:8080',
    startedAt: new Date('2026-07-01T00:00:00Z'),
    completedAt: new Date('2026-07-01T00:02:00Z'),
    durationSeconds: 120,
    totalEndpoints: 2,
    coveredEndpoints: 1,
    coveragePct: 50,
    totalTestCases: 10,
    passedTestCases: 7,
    failedTestCases: 3,
    passRatePct: 70,
  },
  statusCodeDistribution: { '200': 7, '500': 3 },
  endpoints: [
    {
      endpointId: 'ep-1',
      method: HttpMethod.GET,
      path: '/pets',
      passed: true,
      statusCodes: { '200': 7 },
      hasServerErrors: false,
      failureExplanation: null,
    },
    {
      endpointId: 'ep-2',
      method: HttpMethod.DELETE,
      path: '/pets/{id}',
      passed: false,
      statusCodes: { '500': 3 },
      hasServerErrors: true,
      failureExplanation: 'Server crashed, comma "quote" test',
    },
  ],
  failures: [],
};

describe('report-export', () => {
  it('produces CSV with a header and one row per endpoint', () => {
    const csv = reportToCsv(REPORT);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'Method,Path,Passed,StatusCodes,HasServerErrors,FailureExplanation',
    );
    expect(lines).toHaveLength(3); // header + 2 endpoints
    expect(lines[1]).toContain('GET,/pets,pass');
    // fields with commas/quotes are quoted + escaped
    expect(lines[2]).toContain('"Server crashed, comma ""quote"" test"');
  });

  it('produces a PDF buffer', async () => {
    const pdf = await reportToPdf(REPORT);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
