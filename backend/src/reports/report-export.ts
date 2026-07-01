import PDFDocument from 'pdfkit';
import { ReportEndpoint, SuiteReport } from './reports.service';

function statusCodesToText(codes: Record<string, number>): string {
  const entries = Object.entries(codes);
  if (entries.length === 0) return '-';
  return entries.map(([c, n]) => `${c}:${n}`).join(' ');
}

function csvField(value: string): string {
  // Quote if it contains a comma, quote, or newline; escape embedded quotes.
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** One-table CSV of the per-endpoint results. */
export function reportToCsv(report: SuiteReport): string {
  const header = [
    'Method',
    'Path',
    'Passed',
    'StatusCodes',
    'HasServerErrors',
    'FailureExplanation',
  ];
  const lines = [header.join(',')];
  for (const ep of report.endpoints) {
    lines.push(
      [
        ep.method,
        ep.path,
        ep.passed ? 'pass' : 'fail',
        statusCodesToText(ep.statusCodes),
        ep.hasServerErrors ? 'yes' : 'no',
        ep.failureExplanation ?? '',
      ]
        .map((v) => csvField(String(v)))
        .join(','),
    );
  }
  return lines.join('\n');
}

/** Programmatic PDF report (pdfkit). Resolves to the full document buffer. */
export function reportToPdf(report: SuiteReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const o = report.overview;

    doc.fontSize(20).text('AutoRestTest — Test Report', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#555');
    doc.text(`Suite: ${o.name ?? o.suiteId}`);
    doc.text(`Target: ${o.targetUrl}`);
    doc.text(`Status: ${o.status}`);
    if (o.durationSeconds !== null) doc.text(`Duration: ${o.durationSeconds}s`);
    doc.fillColor('#000');
    doc.moveDown(0.8);

    doc.fontSize(14).text('Summary');
    doc.moveDown(0.2);
    doc.fontSize(11);
    doc.text(
      `Endpoint coverage: ${o.coveredEndpoints}/${o.totalEndpoints} (${o.coveragePct}%)`,
    );
    doc.text(
      `Requests: ${o.totalTestCases} total · ${o.passedTestCases} passed · ${o.failedTestCases} failed (${o.passRatePct}% pass rate)`,
    );
    doc.moveDown(0.5);

    doc.fontSize(14).text('Status code distribution');
    doc.moveDown(0.2);
    doc.fontSize(11);
    const dist = Object.entries(report.statusCodeDistribution);
    doc.text(
      dist.length
        ? dist.map(([c, n]) => `${c}: ${n}`).join('    ')
        : 'No requests recorded.',
    );
    doc.moveDown(0.8);

    doc.fontSize(14).text('Endpoints');
    doc.moveDown(0.2);
    doc.fontSize(10);
    for (const ep of report.endpoints) {
      writeEndpointLine(doc, ep);
    }

    if (report.failures.length > 0) {
      doc.moveDown(0.8);
      doc.fontSize(14).fillColor('#b00020').text('Failures');
      doc.fillColor('#000').fontSize(10);
      for (const ep of report.failures) {
        doc.moveDown(0.3);
        doc
          .font('Helvetica-Bold')
          .text(
            `${ep.method} ${ep.path}  [${statusCodesToText(ep.statusCodes)}]`,
          );
        doc.font('Helvetica').text(ep.failureExplanation ?? 'No explanation.', {
          indent: 12,
        });
      }
    }

    doc.end();
  });
}

function writeEndpointLine(doc: PDFKit.PDFDocument, ep: ReportEndpoint): void {
  const mark = ep.passed ? 'PASS' : 'FAIL';
  doc
    .fillColor(ep.passed ? '#0a7d33' : '#b00020')
    .text(mark, { continued: true })
    .fillColor('#000')
    .text(`  ${ep.method} ${ep.path}  (${statusCodesToText(ep.statusCodes)})`);
}
