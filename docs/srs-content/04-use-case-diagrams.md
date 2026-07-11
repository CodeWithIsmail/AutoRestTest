# 4. Use Case Diagrams

Use case diagrams give a non-technical view of the overall system — who uses it
(the *actors*) and what they can do (the *use cases*). AutoRestTest has five
primary (human) actors and three secondary (external system) actors.

**Primary actors.** A **Visitor** is an unauthenticated user who can only sign
up or log in. A **Registered User** owns an account and can create projects and
accept invitations. Within a project, a member holds one of four roles that form
a permission hierarchy — **Viewer** (read-only) ⊂ **Tester** (specs, suites,
runs) ⊂ **Admin** (collaboration, settings) ⊂ **Project Owner** (full control).
Each higher role inherits every capability of the roles below it.

**Secondary actors.** The **LLM API** supplies AI-generated request values,
failure explanations, and specification generation. The **Target REST API** is
the external service under test. The **Email Service** delivers collaboration
invitations.

## Level 0 — System Overview

@fig uc-L0-system.png | Use case diagram — Level 0: AutoRestTest system overview

At the highest level the platform offers seven capability groups:
Authentication, Project & Endpoint Management, API Specification Management, Test
Suite Management, Test Execution, Results & Reports, and Team Collaboration. Each
is decomposed in the Level 1 diagrams that follow.

## Level 1 — Full System (Role-Based)

@fig uc-L1-system.png | Use case diagram — Level 1: Full system, role-based

The Level 1 diagram introduces the role hierarchy and connects each role to the
capabilities it unlocks: a Visitor authenticates; a Registered User creates
projects and accepts invitations; a Viewer reads results and reports; a Tester
manages specifications, generates suites and runs tests; an Admin manages
collaboration; and the Owner has full control including project deletion.

## Level 1.1 — Authentication

@fig uc-1.1-authentication.png | Use case diagram — Level 1.1: Authentication

- **Use Case Name:** Authentication
- **Primary Actors:** Visitor, Registered User
- **Secondary Actors:** —

**Action–Reply**

- **Action:** Visitor opens the sign-up page and submits a username, email, and password.
- **Reply:** System validates email format and the uniqueness of the username and email, creates the account, and issues an authentication token.
- **Action:** Visitor submits email and password on the login page.
- **Reply:** System verifies the credentials and returns a session token, keeping the user signed in across sessions.
- **Action:** Registered User opens their profile.
- **Reply:** System returns the current account details.
- **Action:** Registered User logs out.
- **Reply:** System ends the session.

## Level 1.2 — Project & Endpoint Management

@fig uc-1.2-project-endpoint.png | Use case diagram — Level 1.2: Project & Endpoint Management

- **Use Case Name:** Project & Endpoint Management
- **Primary Actors:** Registered User, Project Owner, Admin, Tester
- **Secondary Actors:** —

**Action–Reply**

- **Action:** User opens the dashboard.
- **Reply:** System lists all projects the user owns or belongs to, with names, creation dates, and last activity.
- **Action:** User creates a project with a name and optional description.
- **Reply:** System creates the project, assigns the user as Owner, and opens the project workspace.
- **Action:** Owner or Admin renames or updates a project.
- **Reply:** System saves the changes.
- **Action:** Owner deletes a project.
- **Reply:** System requests confirmation, then permanently removes the project and all its specifications, endpoints, suites, and results.
- **Action:** Tester adds an endpoint manually (path + HTTP method).
- **Reply:** System validates uniqueness and adds it to the project's endpoint list.
- **Action:** Tester deletes an endpoint.
- **Reply:** System removes it after confirmation.

## Level 1.3 — API Specification Management

@fig uc-1.3-api-specification.png | Use case diagram — Level 1.3: API Specification Management

- **Use Case Name:** API Specification Management
- **Primary Actors:** Tester, Project Owner, Admin
- **Secondary Actors:** LLM API

**Action–Reply**

- **Action:** Tester uploads an OpenAPI 3.0 specification file.
- **Reply:** System validates and parses the file, extracts its endpoints and operations, and displays them; if the file is invalid it reports the problem.
- **Action:** Tester chooses to generate a specification from source code.
- **Reply:** System analyses the source through the LLM API and produces a specification for review.
- **Action:** Tester replaces or deletes the specification.
- **Reply:** System updates the stored spec and re-derives the endpoint list.

## Level 1.4 — Test Suite Management

@fig uc-1.4-test-suite.png | Use case diagram — Level 1.4: Test Suite Management

- **Use Case Name:** Test Suite Management
- **Primary Actors:** Tester, Project Owner, Admin
- **Secondary Actors:** LLM API

**Action–Reply**

- **Action:** Tester configures a test suite (target URL, time budget, mutation rate).
- **Reply:** System records the configuration.
- **Action:** Tester triggers test-suite generation.
- **Reply:** System, using the testing engine with the LLM API for value generation, produces test cases covering the detected endpoints and saves the suite.
- **Action:** Tester views saved suites.
- **Reply:** System lists the project's saved suites.
- **Action:** Tester re-runs a saved suite.
- **Reply:** System re-executes it without reconfiguration.

## Level 1.5 — Test Execution

@fig uc-1.5-test-execution.png | Use case diagram — Level 1.5: Test Execution

- **Use Case Name:** Test Execution
- **Primary Actors:** Tester, Project Owner, Admin
- **Secondary Actors:** Target REST API, LLM API

**Action–Reply**

- **Action:** Tester selects a suite and clicks Run (one-click).
- **Reply:** System starts an asynchronous job that generates test cases and sends requests to the target API.
- **Action:** Tester monitors execution.
- **Reply:** System shows live progress (endpoints tested and completed) without requiring a page refresh.
- **Action:** *(extend)* The run finishes successfully.
- **Reply:** System sends a completion alert with a summary of the outcome.
- **Action:** *(extend)* The run fails (target unreachable, server error, or system error).
- **Reply:** System sends a failure alert describing what went wrong.

## Level 1.6 — Test Results & Reports

@fig uc-1.6-results-reports.png | Use case diagram — Level 1.6: Test Results & Reports

- **Use Case Name:** Test Results & Reports
- **Primary Actors:** Viewer, Tester, Admin, Project Owner
- **Secondary Actors:** LLM API

**Action–Reply**

- **Action:** User opens a completed test run.
- **Reply:** System shows each tested endpoint, the HTTP method used, the response received, and pass/fail.
- **Action:** User filters results by endpoint, response status, or HTTP response code.
- **Reply:** System narrows the displayed results.
- **Action:** User inspects the captured requests.
- **Reply:** System shows every request/response the engine sent during the run, in order.
- **Action:** User views the analytics report.
- **Reply:** System shows the HTTP response-code distribution, endpoint coverage, and server-failure count; failure explanations are generated through the LLM API.
- **Action:** User opens the execution history.
- **Reply:** System lists past runs with timestamps and outcomes, each openable in full.
- **Action:** User exports a report as PDF or CSV.
- **Reply:** System produces a downloadable file containing the results, analytics, and detected failures.

## Level 1.7 — Team Collaboration

@fig uc-1.7-collaboration.png | Use case diagram — Level 1.7: Team Collaboration

- **Use Case Name:** Team Collaboration
- **Primary Actors:** Project Owner, Admin, Invited User
- **Secondary Actors:** Email Service

**Action–Reply**

- **Action:** Owner or Admin invites a member by email and assigns a role.
- **Reply:** System creates a pending invitation with a unique token and sends an invitation email.
- **Action:** Invited User accepts or declines the invitation via the link.
- **Reply:** System adds the user to the project with the assigned role, or marks the invitation declined.
- **Action:** Owner updates a member's role or removes a member.
- **Reply:** System applies the change.
- **Action:** Owner or Admin views members and pending invitations.
- **Reply:** System lists them.
