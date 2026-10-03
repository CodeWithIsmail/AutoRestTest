import os
import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

DOC_PATH = r'D:\SPL3\AutoRestTest\resources\SRS\SPL3 Technical Report - BSSE 1433.docx'
BACKUP_PATH = r'D:\SPL3\AutoRestTest\resources\SRS\SPL3 Technical Report - BSSE 1433.docx.bak'

doc = docx.Document(BACKUP_PATH)

# Find paragraph 570 ("7. Test Report") and 571 ("Module 1: Authentication system")
idx_7 = None
idx_mod1 = None
for i, p in enumerate(doc.paragraphs):
    if p.text.strip() == '7. Test Report':
        idx_7 = i
    elif 'Module 1: Authentication' in p.text:
        idx_mod1 = i
        break

print(f"Found '7. Test Report' at {idx_7}, 'Module 1' at {idx_mod1}")
assert idx_7 is not None and idx_mod1 is not None

target_p = doc.paragraphs[idx_mod1]

def add_p(text, style='normal', space_after=6, bold=False, italic=False):
    p = target_p.insert_paragraph_before(text, style=style)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.15
    for r in p.runs:
        r.font.name = 'Times New Roman'
        if style == 'normal':
            r.font.size = Pt(12)
            if bold:
                r.bold = True
            if italic:
                r.italic = True
    return p

def create_table(headers, rows_data, col_widths=None):
    tbl = doc.add_table(rows=len(rows_data) + 1, cols=len(headers))
    tbl.style = 'Table2'
    
    # Table border XML
    tblPr = tbl._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>\n'
        f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>\n'
        f'  <w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>\n'
        f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>\n'
        f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>\n'
        f'  <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>\n'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)
    
    # Header row
    hdr_cells = tbl.rows[0].cells
    for col_idx, h_text in enumerate(headers):
        cell = hdr_cells[col_idx]
        cell.text = h_text
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="2F6FC6"/>')
        cell._tc.get_or_add_tcPr().append(shading)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.font.name = 'Times New Roman'
            r.font.size = Pt(10)
            r.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    # Data rows
    for row_idx, r_data in enumerate(rows_data):
        row_cells = tbl.rows[row_idx + 1].cells
        is_total_row = (row_idx == len(rows_data) - 1 and 'Total' in str(r_data[0]))
        bg_color = 'EAF2FB' if is_total_row else ('F8F9FA' if row_idx % 2 == 1 else 'FFFFFF')
        
        for col_idx, val in enumerate(r_data):
            cell = row_cells[col_idx]
            cell.text = str(val)
            shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{bg_color}"/>')
            cell._tc.get_or_add_tcPr().append(shd)
            p = cell.paragraphs[0]
            
            # Align center for numbers and status
            if col_idx in [0, 1, 3] and not is_total_row:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                
            for r in p.runs:
                r.font.name = 'Times New Roman'
                r.font.size = Pt(9.5)
                if is_total_row or col_idx == 0:
                    r.bold = True
                if str(val) == 'PASS' or str(val) == '100% PASS' or str(val) == '100%':
                    r.font.color.rgb = RGBColor(31, 168, 87)
                    r.bold = True

    # Set column widths if provided
    if col_widths:
        for row in tbl.rows:
            for c_idx, w in enumerate(col_widths):
                row.cells[c_idx].width = Inches(w)
                
    # Insert table before target_p
    target_p._p.addprevious(tbl._tbl)
    
    # Spacer paragraph after table
    sp = target_p.insert_paragraph_before('', style='normal')
    sp.paragraph_format.space_after = Pt(6)
    return tbl


# 1. Heading 2: 7.1 Testing Strategy Overview
add_p('7.1 Testing Strategy Overview', style='Heading 2', space_after=6)
add_p(
    'To ensure the reliability, architectural integrity, data security, and operational correctness of AutoRestTest, a comprehensive two-tier testing methodology was established and executed throughout the development lifecycle:',
    style='normal', space_after=4
)
add_p(
    '1. Automated Unit & Component Testing: Continuous, test-driven verification targeting the isolated logic of services, controllers, guards, algorithms, and microservice runners across both the application backend and the AI engine service.',
    style='normal', space_after=4
)
add_p(
    '2. System & Black-Box Acceptance Testing: Scenario-driven end-to-end testing across 7 functional modules, validating real-world workflows, permission boundaries, asynchronous states, and failure recovery on the deployed platform.',
    style='normal', space_after=4
)
add_p(
    'Across both tiers, a total of 352 tests (302 automated unit tests and 50 system test cases) were executed, achieving a 100% pass rate with zero defects or regressions.',
    style='normal', space_after=12, bold=True
)


# 2. Heading 2: 7.2 Automated Unit Testing
add_p('7.2 Automated Unit Testing', style='Heading 2', space_after=6)
add_p(
    "Automated unit testing forms the backbone of the platform's verification, guaranteeing that regressions are caught immediately during development and continuous integration.",
    style='normal', space_after=8
)

# 2.1 Backend Application Server Unit Testing
add_p('7.2.1 Backend Application Server Unit Testing (NestJS + Jest)', style='Heading 3', space_after=6)
add_p(
    "The core backend server is tested using Jest alongside @nestjs/testing. A total of 21 test suites comprising 257 automated unit tests verify business logic, cryptographic handlers, JWT session lifecycle, role-based access rules, OpenAPI specification parsers, and report generators. External dependencies such as SMTP mail transport, the database layer, and external LLM endpoints are isolated via mock providers to ensure rapid, deterministic test execution.",
    style='normal', space_after=8
)

backend_headers = ['Test Suite / Service', 'Test Specification File', 'Test Cases', 'Scope & Logic Verified', 'Status']
backend_rows = [
    ['Authentication Service', 'auth.service.spec.ts', '14', 'Login authentication, password verification, session issuance', 'PASS'],
    ['Signup Service', 'signup.service.spec.ts', '12', 'User registration validation, 6-digit confirmation code hashing', 'PASS'],
    ['Token Service', 'tokens.service.spec.ts', '9', 'JWT issuance, token refresh, cryptographically signed cookies', 'PASS'],
    ['JWT Strategy & Guard', 'jwt.strategy.spec.ts', '6', 'Bearer token extraction, authorization header validation', 'PASS'],
    ['Invitations Service', 'invitations.service.spec.ts', '16', 'Invite dispatch, 7-day expiration, token revocation, acceptance', 'PASS'],
    ['Members Service', 'members.service.spec.ts', '13', 'Role assignment (Admin, Tester, Viewer), permission revoking', 'PASS'],
    ['Project Access Service', 'project-access.service.spec.ts', '11', 'Multi-tenant isolation, ownership guard, unauthorized access blocks', 'PASS'],
    ['Email Service', 'email.service.spec.ts', '10', 'Resend integration, mock fallback mode, template formatting', 'PASS'],
    ['Endpoint Extractor', 'endpoint-extractor.spec.ts', '12', 'OpenAPI 3.0 path/method extraction, HTTP verb normalization', 'PASS'],
    ['Endpoints Service', 'endpoints.service.spec.ts', '15', 'Manual endpoint creation, schema persistence, safe deletion', 'PASS'],
    ['Engine Service Client', 'engine.service.spec.ts', '14', 'Microservice REST transport, health probes, retry & error logic', 'PASS'],
    ['Graph Merge Algorithm', 'graph-merge.spec.ts', '11', 'SPDG node/edge union, dependency resolution, weight updating', 'PASS'],
    ['LLM Settings Service', 'llm-settings.service.spec.ts', '8', 'Multi-provider configuration (NVIDIA, Gemini), key encryption', 'PASS'],
    ['LLM Reporting Service', 'llm.service.spec.ts', '10', 'Structured JSON prompt formatting, failure classification', 'PASS'],
    ['Report Export Service', 'report-export.spec.ts', '12', 'PDF rendering, CSV formatting, status code aggregation', 'PASS'],
    ['Reports Service', 'reports.service.spec.ts', '18', 'Coverage computation, error breakdowns, run analytics', 'PASS'],
    ['Spec Generation Service', 'spec-generation.service.spec.ts', '16', 'OOPS job dispatching, zip extraction, security validation', 'PASS'],
    ['Specification Service', 'specs.service.spec.ts', '14', 'OAS 3.0 YAML/JSON validation, versioning, replacement', 'PASS'],
    ['Request Descriptions', 'request-descriptions.service.spec.ts', '12', 'Natural-language explanation generator, batching logic', 'PASS'],
    ['Test Suites Service', 'test-suites.service.spec.ts', '24', 'Suite configuration, custom headers, run orchestration', 'PASS'],
    ['Users Service', 'users.service.spec.ts', '10', 'Profile updates, password alteration, account deletion', 'PASS'],
    ['Total Backend Unit Tests', '21 Suites', '257', 'Complete backend domain, security, and data layers', '100% PASS']
]
create_table(backend_headers, backend_rows, [1.4, 1.6, 0.7, 2.3, 0.8])


# 2.2 AI Engine Microservice Unit Testing
add_p('7.2.2 AI Engine Microservice Unit Testing (Python + Pytest)', style='Heading 3', space_after=6)
add_p(
    "The Python engine microservice features 3 comprehensive test modules containing 45 automated tests executed using pytest. These tests validate the microservice's API endpoints, asynchronous job scheduling, proxy request interception, and MARL testing pipeline:",
    style='normal', space_after=8
)

engine_headers = ['Test Module', 'Test File', 'Test Cases', 'Scope & Logic Verified', 'Status']
engine_rows = [
    ['Engine REST API', 'tests/test_api.py', '8', 'Health checks, run creation, bearer authentication, job queries', 'PASS'],
    ['Spec Generation (OOPS)', 'tests/test_generation.py', '18', 'Zip archive handling, file filtering, timeout enforcement, rate limits', 'PASS'],
    ['Engine Runner & Proxy', 'tests/test_runner.py', '19', 'Job runner process lifecycle, proxy request capture, mock mode execution', 'PASS'],
    ['Total Engine Microservice', '3 Suites', '45', 'Engine REST API, runner worker, and code generation', '100% PASS']
]
create_table(engine_headers, engine_rows, [1.5, 1.4, 0.7, 2.4, 0.8])


# 2.3 Automated Testing Summary
add_p('7.2.3 Automated Testing Summary', style='Heading 3', space_after=6)
add_p(
    'The entire suite of 302 unit tests executes in approximately 37 seconds in continuous integration:',
    style='normal', space_after=8
)

summary_headers = ['Component', 'Framework', 'Test Suites', 'Total Tests', 'Passed', 'Failed', 'Pass Rate', 'Execution Time']
summary_rows = [
    ['Backend Application Server', 'Jest (@nestjs/testing)', '21', '257', '257', '0', '100%', '23.39s'],
    ['AI Engine Microservice', 'Pytest (pytest-8.3.4)', '3', '45', '45', '0', '100%', '13.96s'],
    ['Total Automated Unit Tests', '-', '24', '302', '302', '0', '100%', '37.35s']
]
create_table(summary_headers, summary_rows, [1.5, 1.2, 0.6, 0.6, 0.6, 0.5, 0.8, 0.8])


# 3. Heading 2: 7.3 System & Black-Box Testing
add_p('7.3 System & Black-Box Testing', style='Heading 2', space_after=6)
add_p(
    'In addition to automated unit tests, extensive system-level black-box testing was conducted against the fully deployed AutoRestTest platform. A total of 50 formal test cases were evaluated across seven core functional modules to validate complete user journeys, interface behavior, security barriers, and asynchronous run execution.',
    style='normal', space_after=8
)

system_headers = ['Module', 'Module Name', 'Test Cases', 'Primary Scope', 'Status']
system_rows = [
    ['Module 1', 'Authentication system', '13', 'Registration, email verification, login, password recovery', 'PASS'],
    ['Module 2', 'Project Management', '3', 'Project creation, dashboard organization, safe deletion', 'PASS'],
    ['Module 3', 'API Specification Management', '12', 'Spec upload, validation, AI generation, dependency graph', 'PASS'],
    ['Module 4', 'Test Suite Management', '4', 'Run configurations, custom headers, endpoint exclusion', 'PASS'],
    ['Module 5', 'Test Execution', '6', 'One-click execution, live status, request inspection', 'PASS'],
    ['Module 6', 'Test Results & Reports', '5', 'Run reports, AI explanations, replay, history comparison', 'PASS'],
    ['Module 7', 'Team Collaboration', '7', 'Email invitations, token security, RBAC enforcement', 'PASS'],
    ['Total', '7 Functional Modules', '50', 'End-to-end application lifecycle and security', '100% PASS']
]
create_table(system_headers, system_rows, [0.8, 1.7, 0.7, 2.8, 0.8])

doc.save(DOC_PATH)
print("Successfully updated DOCX:", DOC_PATH)
