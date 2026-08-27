# AutoRestTest — Software Test Report

*An AI-Powered Platform for Automated REST API Testing*

> This is the Markdown edition of the test report. The submitted copy lives at
> `resources/SRS/AutoRestTest Test Report.docx`; both are generated from the same
> source, so they always agree.

---

## Contents

1. [Introduction](#1-introduction)
2. [High-level description of testing goals](#2-high-level-description-of-testing-goals)
3. [Test environment and approach](#3-test-environment-and-approach)
4. [Test cases](#4-test-cases)
    - [Module 1: Authentication and Account Verification](#module-1-authentication-and-account-verification)
    - [Module 2: Account and Profile Management](#module-2-account-and-profile-management)
    - [Module 3: Project Management](#module-3-project-management)
    - [Module 4: API Specification Management](#module-4-api-specification-management)
    - [Module 5: AI Specification Generation from Source Code](#module-5-ai-specification-generation-from-source-code)
    - [Module 6: Endpoint Management](#module-6-endpoint-management)
    - [Module 7: Dependency Graph Visualisation](#module-7-dependency-graph-visualisation)
    - [Module 8: Test Run Configuration](#module-8-test-run-configuration)
    - [Module 9: Test Execution](#module-9-test-execution)
    - [Module 10: Captured Requests and Inspection](#module-10-captured-requests-and-inspection)
    - [Module 11: AI-Generated Request Descriptions](#module-11-ai-generated-request-descriptions)
    - [Module 12: Reports, Analytics and Export](#module-12-reports-analytics-and-export)
    - [Module 13: Replay and Run History](#module-13-replay-and-run-history)
    - [Module 14: Team Collaboration and Role-Based Access](#module-14-team-collaboration-and-role-based-access)
    - [Module 15: Platform Administration](#module-15-platform-administration)
    - [Module 16: Notifications, Security and Cross-Cutting Behaviour](#module-16-notifications-security-and-cross-cutting-behaviour)
5. [Test summary](#5-test-summary)
6. [Conclusion](#6-conclusion)

---

## 1. Introduction

This document reports the results of system testing carried out on AutoRestTest, an AI-powered platform for automated REST API testing. It supersedes the preliminary test plan presented in the earlier technical report: the platform has grown well beyond the ten scenarios that plan covered, and several of its most substantial capabilities - generating an OpenAPI specification from a project's source code, visualising the semantic dependency graph the engine builds, replaying a recorded run as a regression check, describing generated requests in plain language, and administering the AI providers from inside the product - did not exist when that plan was written.

The system under test is a monorepo of five cooperating parts: a Python testing engine that parses an OpenAPI 3.0 specification and drives request generation with multi-agent reinforcement learning and AI-backed value generation; a second Python pipeline that reads a REST API's source code and writes an OpenAPI specification for it; a microservice that wraps both Python tools behind an asynchronous job interface and records the engine's traffic through a proxy; an application server providing authentication, projects, specifications, endpoints, test runs, reports and collaboration; and a web client through which all of it is used. The test cases below exercise the platform end to end, through the web interface and its underlying API, as a user would.

Testing was black-box and scenario-driven. Each case states the scenario, the steps a tester follows, the outcome the system is expected to produce, and the result observed. Cases were chosen to cover the normal path of every feature, the validation and permission boundaries around it, and the failure modes that matter most in a system where a single action can send thousands of live requests to somebody else's API.

## 2. High-level description of testing goals

The testing effort was directed at the following goals:

- To verify that AutoRestTest meets its functional requirements across project management, specification handling, endpoint extraction, test execution, reporting and collaboration.
- To ensure that users can register, prove ownership of their email address, sign in securely, and reach only the projects they are authorised for.
- To confirm that uploaded OpenAPI 3.0 specifications are parsed and validated correctly, that operations are extracted accurately, and that malformed or unsupported documents are rejected with a message the user can act on.
- To verify that an OpenAPI specification generated from a project's source code is produced reliably, reviewed before it is adopted, and held to exactly the same validation standard as an uploaded one.
- To ensure the AI testing engine generates and executes valid requests against a live API within its configured time budget, and that the platform reports its progress accurately without blocking the user.
- To confirm that the semantic dependency graph is built from the specification alone, is presented in a form a user can actually read, and carries the engine's learned weights when shown beside a completed run.
- To verify that every request the engine sent is captured, inspectable in full, filterable, reproducible outside the platform, and re-sendable on demand.
- To confirm that run results, coverage and response-code analytics, AI-written failure explanations and AI-written request descriptions are accurate, resumable and clearly presented.
- To verify that reports export correctly as CSV and PDF, and that a recorded run can be replayed as a deterministic regression check whose history stays comparable over time.
- To guarantee that team collaboration and role-based access control work correctly and securely, and that no invitation, identifier or session can be used to reach a project the caller was not granted.
- To confirm that credentials entered into the platform - target-API authentication headers and AI provider keys - are never echoed back through the interface and never forwarded to a third party.
- To confirm the usability and responsiveness of the interface under concurrent use by multiple users and long-running background jobs.

## 3. Test environment and approach

Testing was performed against a full deployment of the platform: the application server and its PostgreSQL database, the web client, and the engine microservice with both Python tools installed. Test runs were directed at a small sample REST API deployed locally, so that the engine's requests could be observed at the target as well as inside the platform. AI-backed features were exercised against a live provider, and additionally in the platform's mock mode so that flows depending on a slow or paid provider could be repeated cheaply and deterministically. Email was exercised both through the live provider and in mock mode.

Three or more accounts were used throughout, so that ownership, project administrator, tester and viewer roles could be exercised against the same project simultaneously, and so that cross-account access attempts were made with genuinely separate sessions rather than by manipulating one.

## 4. Test cases

The test cases are grouped by functional module. Each is numbered continuously across the whole report so it can be cited unambiguously.

---

## Module 1: Authentication and Account Verification

### Test Case 1: User Registration with Valid Details

**Test Scenario:** A new user signs up for AutoRestTest for the first time.

**Steps:**

1. Open the registration page and enter a username, an email address, and a password of at least eight characters.
2. Submit the registration form.
3. Check the system for a newly created account.

**Expected Outcome:**

- The system accepts the request and tells the user that a six-digit confirmation code has been sent to their email address.
- No account is created yet. The attempt is held aside as a pending signup, with the password already stored in a secure, unreadable form and the code stored only as a hash.
- No login session is issued at this stage, so an unconfirmed address gains no access to the platform.

**Result:** Pass.

### Test Case 2: User Registration with Invalid or Missing Fields

**Test Scenario:** A user submits the registration form with information that does not meet the platform's rules.

**Steps:**

1. Submit the form with a two-character username.
2. Submit again with a username containing a hyphen.
3. Submit again with a five-character password.
4. Submit again leaving the email address blank.

**Expected Outcome:**

- Each attempt is rejected immediately with a clear, field-specific message: the username must be at least three characters, may contain only letters, numbers and underscores; the password must be at least eight characters; a valid email address is required.
- No pending signup is written for any of the rejected attempts.

**Result:** Pass.

### Test Case 3: Registration with an Already Registered Email or Username

**Test Scenario:** A user tries to sign up using an email address or username that already belongs to a confirmed account.

**Steps:**

1. Complete registration and confirmation for the username "tester01".
2. Register again using the same email address.
3. Register once more using the same username but a different email address.

**Expected Outcome:**

- Both later attempts are rejected.
- The system says clearly which value is taken - "Email is already registered" or "Username is already taken".
- The existing account is unaffected.

**Result:** Pass.

### Test Case 4: Re-registering an Unconfirmed Address (Anti-Squatting)

**Test Scenario:** Someone registers with an email address they do not own, and later the real owner of that address signs up.

**Steps:**

1. Register with owner@example.com and never confirm the code.
2. Register again with owner@example.com using a different username and password.
3. Confirm using the code from the second email.

**Expected Outcome:**

- The second registration is accepted rather than rejected as a duplicate.
- It replaces the first pending signup, so only the second code works.
- The account is created for whoever could actually read the inbox.
- An unconfirmed address never permanently claims an email address on the platform.

**Result:** Pass.

### Test Case 5: Email Confirmation with the Correct Code

**Test Scenario:** A newly registered user confirms their address with the code they received.

**Steps:**

1. Read the six-digit code from the confirmation email.
2. Enter the email address and the code on the confirmation screen.

**Expected Outcome:**

- The account is created and the pending signup is removed, both in a single step so a half-created account is not possible.
- A login token is returned together with the user's profile, in exactly the same shape as a normal login.
- The user lands on the dashboard already signed in.

**Result:** Pass.

### Test Case 6: Email Confirmation with a Wrong Code

**Test Scenario:** A user mistypes the confirmation code repeatedly.

**Steps:**

1. Submit an incorrect six-digit code.
2. Repeat with different incorrect codes up to five times.
3. Try once more with the correct code.

**Expected Outcome:**

- Every wrong attempt is rejected and the number of remaining attempts is tracked.
- On the fifth wrong attempt the pending signup is destroyed and the user is told to register again.
- The correct code no longer works afterwards, and no account was ever created.

**Result:** Pass.

### Test Case 7: Resending the Confirmation Code

**Test Scenario:** A user does not receive the first confirmation email and asks for another.

**Steps:**

1. Press "Resend code" on the confirmation screen.
2. Confirm using the newly received code.
3. Press "Resend code" repeatedly in quick succession.

**Expected Outcome:**

- A fresh code is emailed and the expiry window is renewed.
- The previous code stops working, so only the most recent one is valid.
- Repeated presses are throttled after three requests in fifteen minutes.

**Result:** Pass.

### Test Case 8: Login with Email and with Username

**Test Scenario:** A confirmed user signs in using either of their two identifiers.

**Steps:**

1. Log in with the registered email address and password.
2. Log out.
3. Log in with the username and the same password.

**Expected Outcome:**

- Both attempts succeed and a login token is issued each time.
- A single identifier field accepts either form, so the user does not have to remember which one they registered with.

**Result:** Pass.

### Test Case 9: Login with Wrong Password or Unknown Account

**Test Scenario:** Someone attempts to sign in with credentials that do not match.

**Steps:**

1. Enter a valid email address with the wrong password.
2. Enter an email address that has never registered.

**Expected Outcome:**

- Both attempts are denied.
- Both return exactly the same generic message, so the response does not reveal whether an account exists for that address.

**Result:** Pass.

### Test Case 10: Password Reset

**Test Scenario:** A user forgets their password and resets it from the emailed link.

**Steps:**

1. Request a reset for a registered email address.
2. Open the emailed link and set a new password.
3. Try to sign in with the old password, then with the new one.
4. Try to use a session token that was issued before the reset.

**Expected Outcome:**

- A reset link is emailed and expires after thirty minutes; the secret is stored only as a hash, never in readable form.
- The new password works and the old one is refused.
- Every session created before the reset is rejected, so a stolen token cannot survive a password reset.
- The reset link cannot be used a second time.

**Result:** Pass.

### Test Case 11: Password Reset for an Unknown Email

**Test Scenario:** Someone requests a reset for an address that has no account.

**Steps:**

1. Submit a reset request for an address that was never registered.

**Expected Outcome:**

- The response is the same neutral message shown for a registered address.
- The reset form cannot be used to discover which addresses have accounts on the platform.

**Result:** Pass.

### Test Case 12: Access to a Protected Page Without Signing In

**Test Scenario:** Someone opens an application page without a valid session.

**Steps:**

1. Open the projects dashboard with no session.
2. Call the profile endpoint with no token, then with an expired token.

**Expected Outcome:**

- Access is denied in every case.
- The web client redirects to the login page rather than showing an empty dashboard.

**Result:** Pass.

### Test Case 13: Rate Limiting on Authentication Endpoints

**Test Scenario:** An attacker (or a stuck script) hammers the sign-in and reset endpoints.

**Steps:**

1. Submit six registration attempts within one hour from the same client.
2. Submit eleven login attempts within five minutes.
3. Submit four password-reset requests within fifteen minutes.
4. While doing this, keep a test run open in another tab so its status is being polled.

**Expected Outcome:**

- Each endpoint starts refusing further attempts once its own limit is reached, and accepts them again after the window passes.
- Limits are counted per caller, not globally.
- The polling of run status and dependency-graph builds is unaffected, because the limits are applied only to the account-related endpoints.

**Result:** Pass.

---

## Module 2: Account and Profile Management

### Test Case 14: Update Display Name and Avatar Colour

**Test Scenario:** A signed-in user personalises their profile.

**Steps:**

1. Open Settings and change the display name.
2. Pick a different avatar colour and save.
3. Clear the display name and save again.

**Expected Outcome:**

- Both changes are saved and appear immediately in the header without a reload.
- Clearing the display name falls back to showing the username.

**Result:** Pass.

### Test Case 15: Username and Email Cannot Be Changed

**Test Scenario:** A user attempts to change the two identifiers that must stay fixed.

**Steps:**

1. Send a profile update containing a new username.
2. Send another containing a new email address.

**Expected Outcome:**

- Both are rejected as fields that are not accepted on that form.
- The stored username and email are unchanged, so a login identifier can never be moved out from under an existing session.

**Result:** Pass.

### Test Case 16: Change Password

**Test Scenario:** A user changes their password from the settings page.

**Steps:**

1. Enter the current password and a new one, and save.
2. Try again with an incorrect current password.
3. Try setting the new password to the value it already has.
4. Use a session token that was issued before the change.

**Expected Outcome:**

- The valid change succeeds and a security notice is emailed to the account holder.
- A wrong current password is refused with "Current password is incorrect."
- Reusing the same password is refused.
- Sessions created before the change stop working.

**Result:** Pass.

### Test Case 17: Notification Preferences

**Test Scenario:** A user turns off the two optional email notifications.

**Steps:**

1. Switch off "run finished" and "invitation" emails and save.
2. Complete a test run and have another user send an invitation.
3. Change the password from the settings page.

**Expected Outcome:**

- Preferences are saved and reflected on reload.
- Neither optional email is sent any more.
- Security notices and confirmation or reset emails are still delivered, because those cannot be switched off.

**Result:** Pass.

### Test Case 18: Delete Account

**Test Scenario:** A user permanently closes their account.

**Steps:**

1. Press Delete account and submit without a password.
2. Submit with an incorrect password.
3. Submit with the correct password.
4. Try to sign in afterwards, and check a project the user had run tests in for someone else.

**Expected Outcome:**

- The first two attempts are refused: a valid session alone is not enough for an irreversible action.
- On the correct password, the account and everything it owns is removed.
- Signing in afterwards fails.
- Runs the user triggered inside other people's projects are preserved, with the attribution simply cleared.

**Result:** Pass.

---

## Module 3: Project Management

### Test Case 19: Create a Project

**Test Scenario:** A user creates a workspace to hold an API under test.

**Steps:**

1. Open the dashboard and press New project.
2. Enter a name and a description and create it.

**Expected Outcome:**

- The project is created with the creator as its owner and also recorded as a project administrator.
- It appears on the dashboard immediately, ready to receive a specification.

**Result:** Pass.

### Test Case 20: Create a Project with Invalid Input

**Test Scenario:** A user submits the project form with values outside the accepted range.

**Steps:**

1. Submit with an empty name.
2. Submit with a 150-character name.
3. Submit with a 600-character description.

**Expected Outcome:**

- Each attempt is rejected with the matching message about the field's length.
- No project is created.

**Result:** Pass.

### Test Case 21: Project Access Control

**Test Scenario:** An unrelated account tries to open someone else's project.

**Steps:**

1. Sign in as a user with no connection to a given project.
2. Open that project's page directly by its URL.
3. Also request a project id that does not exist at all.

**Expected Outcome:**

- Access to the existing project is denied because the caller is not the owner and not a member.
- A non-existent id is reported as not found.
- No project name, description, specification, or result data is revealed in either case.

**Result:** Pass.

### Test Case 22: Edit Project Details

**Test Scenario:** A project administrator corrects the project's name and description.

**Steps:**

1. Rename the project and save.
2. Change the description and save.
3. Submit the form with nothing changed at all.

**Expected Outcome:**

- Both edits are stored and shown immediately.
- An update containing no fields is rejected with a message asking for at least one field.

**Result:** Pass.

### Test Case 23: Delete a Project

**Test Scenario:** The owner permanently removes a project and everything under it.

**Steps:**

1. As the owner, press Delete and confirm with the account password.
2. Repeat as a project administrator who is not the owner.
3. Repeat as the owner but with the wrong password.
4. Press Delete repeatedly in a short period.

**Expected Outcome:**

- The owner's confirmed deletion removes the project together with its specification, endpoints, runs, captured requests, members and invitations.
- An administrator who is not the owner is refused, and so is a wrong password.
- Repeated attempts are throttled after five in fifteen minutes.

**Result:** Pass.

---

## Module 4: API Specification Management

### Test Case 24: Upload a Valid OpenAPI 3.0 Specification

**Test Scenario:** A user uploads the API contract that the platform will test against.

**Steps:**

1. Open the project's Specification tab and upload a valid OpenAPI 3.0 YAML file.
2. Repeat with the equivalent JSON file.
3. Open the Endpoints tab.

**Expected Outcome:**

- Both files are accepted and stored, and the API title and OpenAPI version are shown.
- Every path and method pair in the document is extracted and listed as an endpoint, with the operation summary used as its description.
- The endpoint count on the specification page matches what the Endpoints tab shows.

**Result:** Pass.

### Test Case 25: Upload a Malformed Specification

**Test Scenario:** A user uploads a file that cannot be understood as an OpenAPI document.

**Steps:**

1. Upload a file with broken YAML indentation.
2. Upload a specification containing a reference that does not resolve.
3. Upload an empty file.

**Expected Outcome:**

- Each file is rejected with a specific message explaining what is wrong, rather than a generic error.
- The project's existing specification and endpoints are left exactly as they were.

**Result:** Pass.

### Test Case 26: Upload a Swagger 2.0 Document

**Test Scenario:** A user uploads an older-format API description.

**Steps:**

1. Upload a valid Swagger 2.0 document.

**Expected Outcome:**

- The file is rejected with a message stating that Swagger 2.0 is not supported and asking the user to convert to OpenAPI 3.0 first.

**Result:** Pass.

### Test Case 27: Upload an Unsupported File Type or an Oversized File

**Test Scenario:** A user uploads something that is not a specification, or one that is too large.

**Steps:**

1. Upload a .txt file.
2. Upload a specification file larger than five megabytes.

**Expected Outcome:**

- The unsupported extension is rejected with the list of accepted types (.yaml, .yml, .json).
- The oversized file is rejected against the stated five-megabyte limit before it is parsed.

**Result:** Pass.

### Test Case 28: Replace an Existing Specification

**Test Scenario:** A user uploads a newer version of the API contract over an existing one.

**Steps:**

1. Upload a specification, add one endpoint manually, and build the dependency graph.
2. Upload a different specification over it.
3. Check the Endpoints and Dependencies tabs, and then an earlier completed run.

**Expected Outcome:**

- The new specification and its endpoints appear together, never a new specification with stale endpoints.
- Endpoints from the previous specification, including the manually added one, are cleared.
- The dependency graph built from the old specification is removed rather than shown as if it were current.
- Results of runs that already completed are untouched and still readable.

**Result:** Pass.

### Test Case 29: Specification Permissions

**Test Scenario:** Members of different roles attempt to change the project's specification.

**Steps:**

1. As a viewer, attempt to upload and then to delete the specification.
2. As a tester, attempt the same.
3. As a project administrator and as the owner, attempt the same.
4. As a viewer, simply open the stored specification.

**Expected Outcome:**

- Only the owner and project administrators can upload or delete a specification.
- Testers and viewers are refused with a permission message.
- Viewers can still read the stored specification, so read access is not affected.

**Result:** Pass.

---

## Module 5: AI Specification Generation from Source Code

### Test Case 30: Generate a Specification from a Source Archive

**Test Scenario:** A user has a REST API project but no OpenAPI document, and asks the platform to produce one from the source code.

**Steps:**

1. On the Specification tab choose "Generate from source".
2. Upload a .zip archive of the API's source code, optionally setting a title, version and extra directories to ignore.
3. Start the generation and watch the progress panel.

**Expected Outcome:**

- The job is accepted and queued, and the panel shows the pipeline advancing through its nine steps.
- The generation runs on its own queue, so a test run started at the same time is not blocked behind it.
- When it finishes, the generated OpenAPI document is presented for review rather than applied automatically.

**Result:** Pass.

### Test Case 31: Reject an Invalid or Unsafe Source Upload

**Test Scenario:** A user uploads something the generator should not accept.

**Steps:**

1. Upload a .tar.gz archive instead of a .zip.
2. Upload a .zip larger than fifty megabytes.
3. Upload a .zip containing an entry with a "../" path, and another containing a symbolic link.

**Expected Outcome:**

- The non-zip archive is rejected with a message asking for a .zip.
- The oversized archive is rejected against the stated fifty-megabyte limit.
- The unsafe archives are refused during extraction, and nothing is written outside the job's own working directory.

**Result:** Pass.

### Test Case 32: Concurrent Generation Is Blocked

**Test Scenario:** A user starts a second generation for the same project while the first is still running.

**Steps:**

1. Start a generation and wait until it reports as running.
2. Start a second generation for the same project.

**Expected Outcome:**

- The second request is refused with a message that a specification is already being generated for this project.
- The running generation continues undisturbed.

**Result:** Pass.

### Test Case 33: Review and Apply a Generated Specification

**Test Scenario:** A user reviews the generated document and adopts it as the project's specification.

**Steps:**

1. Inspect the generated document in the review panel.
2. Press Apply.
3. Open the Endpoints tab and the Specification tab.

**Expected Outcome:**

- The generated document is validated to exactly the same standard as an uploaded one before it is accepted.
- It becomes the project's specification, clearly marked as AI-generated.
- Its operations are extracted into endpoints, and the generation record is cleared.
- Nothing is replaced until Apply is pressed.

**Result:** Pass.

### Test Case 34: Discard a Generated Specification

**Test Scenario:** A user is not satisfied with the generated document and throws it away.

**Steps:**

1. With a completed generation awaiting review, press Discard.
2. Check the Specification and Endpoints tabs.

**Expected Outcome:**

- The generation and its job are removed.
- The project's existing specification and endpoints remain exactly as they were before the generation was started.

**Result:** Pass.

---

## Module 6: Endpoint Management

### Test Case 35: View and Search Endpoints

**Test Scenario:** A user reviews the operations extracted from the specification.

**Steps:**

1. Open the Endpoints tab of a project with a parsed specification.
2. Type part of a path into the search box, then type a method name such as "post".
3. Open one endpoint row.

**Expected Outcome:**

- Every extracted operation is listed with its method, path and description.
- The search narrows the list on both path and method.
- The detail panel shows the operation's parameters, request body and declared responses, read from the stored specification.

**Result:** Pass.

### Test Case 36: Add an Endpoint Manually

**Test Scenario:** A user adds an operation that is not (or not yet) in the specification.

**Steps:**

1. Add POST /internal/health with a short description.
2. Open the run configuration form.

**Expected Outcome:**

- The endpoint is created, marked as manually added, and listed alongside the extracted ones.
- It is immediately available when configuring a test run.

**Result:** Pass.

### Test Case 37: Manual Endpoint Validation

**Test Scenario:** A user adds an endpoint with an invalid or duplicate definition.

**Steps:**

1. Add an endpoint whose path does not start with a slash.
2. Add an endpoint whose method and path already exist in the project.

**Expected Outcome:**

- The first is rejected with a message that the path must start with "/".
- The second is rejected as a duplicate, so the project cannot hold the same operation twice.

**Result:** Pass.

### Test Case 38: Delete an Endpoint

**Test Scenario:** A user removes an endpoint they no longer want tested.

**Steps:**

1. As the owner or a project administrator, delete a manually added endpoint.
2. As a tester, attempt the same.
3. Configure a new run afterwards.

**Expected Outcome:**

- The owner or administrator deletion succeeds and the row disappears from the list.
- The tester is refused with a permission message.
- The deleted endpoint no longer appears when configuring a run.

**Result:** Pass.

---

## Module 7: Dependency Graph Visualisation

### Test Case 39: Build the Project Dependency Graph

**Test Scenario:** A user asks the platform to work out how the API's operations depend on each other.

**Steps:**

1. Open the project's Dependencies tab and press Build.
2. Watch the status while the build runs.
3. Read the summary line once it completes.

**Expected Outcome:**

- The build is queued on the engine and the page tracks it until it is ready, without the user having to reload.
- On completion the view reports how many operations and how many resolved dependencies the graph holds.
- The build uses only the stored specification: no test run, no live API and no AI call is required.

**Result:** Pass.

### Test Case 40: Build Without a Specification, or Twice at Once

**Test Scenario:** A user presses Build in circumstances where it cannot or should not run.

**Steps:**

1. Press Build on a project that has no specification.
2. On a project with a specification, press Build and then press it again while the first build is running.

**Expected Outcome:**

- The first is refused with a message that the project has no specification to build a graph from.
- The second press is refused with a message that a build is already in progress, and the running build is not disturbed.

**Result:** Pass.

### Test Case 41: Inspect One Operation's Dependencies

**Test Scenario:** A user examines which operations feed into a given operation and which consume its output.

**Steps:**

1. Choose an operation from the list beside the diagram.
2. Read the diagram and the labels on the arrows.
3. Note the order in which the operations are listed and which one is selected first.

**Expected Outcome:**

- The diagram shows the operations that can supply this one's parameters on one side, the selected operation in the middle, and the operations that consume its response on the other.
- Each arrow is labelled with the parameter that connects the two operations.
- The list is ordered by how many connections each operation has, and opens on the most connected one, so the operations worth looking at are not buried alphabetically.

**Result:** Pass.

### Test Case 42: Large Neighbourhoods and Dependency Cycles

**Test Scenario:** A user selects an operation that many others depend on, and a specification with mutual dependencies.

**Steps:**

1. Select an operation with more than eight producers or consumers.
2. Expand the folded card.
3. On a specification with mutual dependencies, read the summary line and select one of the operations involved.

**Expected Outcome:**

- The first eight neighbours are drawn and the remainder are folded into an expandable "+N more" card, so the diagram stays readable.
- Expanding the card lists every remaining operation.
- The summary reports how many dependency cycles the graph contains, and an operation caught in one appears on both sides of the focused operation.

**Result:** Pass.

### Test Case 43: Dependency Graph Attached to a Completed Run

**Test Scenario:** A user views the graph as it stood for a particular test run, with what the engine learned about it.

**Steps:**

1. Open a completed run and view its dependency graph.
2. Compare the weight shown on each dependency with the run's behaviour.
3. Open a run recorded before the graph feature was revised.

**Expected Outcome:**

- The run shows the graph that produced its results, even if the project's specification has since changed.
- Each dependency carries the weight the reinforcement-learning agent assigned to it during that run.
- An older run's stored graph is re-resolved when it is read, so old and new runs display in the same, readable form.

**Result:** Pass.

---

## Module 8: Test Run Configuration

### Test Case 44: Configure a Test Run

**Test Scenario:** A user sets up a run of the AI testing engine against a live API.

**Steps:**

1. Press New run and give the run a name.
2. Enter the target base URL, a time budget in seconds and a mutation rate.
3. Save the configuration.

**Expected Outcome:**

- The run record is created in a pending state with exactly the settings entered.
- It appears at the top of the project's run list, ready to be started.

**Result:** Pass.

### Test Case 45: Run Configuration Validation

**Test Scenario:** A user enters run settings outside the accepted range.

**Steps:**

1. Enter a target URL with no http:// or https:// prefix.
2. Enter a time budget of 0, then of 7200 seconds.
3. Enter a mutation rate of 1.5.

**Expected Outcome:**

- The URL is rejected with a message requiring a scheme.
- The time budget is rejected unless it is between 1 and 3600 seconds.
- The mutation rate is rejected unless it is between 0 and 1.
- A local target such as http://localhost:8080 is accepted, so a developer can test an API on their own machine.

**Result:** Pass.

### Test Case 46: Configure a Run on a Project with No Endpoints

**Test Scenario:** A user tries to set up a run before uploading a specification.

**Steps:**

1. On a project with no specification and no manual endpoints, press New run and submit.

**Expected Outcome:**

- The request is refused with a message asking the user to upload a specification or add an endpoint first, rather than creating a run that has nothing to test.

**Result:** Pass.

### Test Case 47: Custom Authentication Headers

**Test Scenario:** A user configures a run against an API that requires authentication.

**Steps:**

1. Open the Advanced section of the run form.
2. Add an Authorization header carrying a Bearer token, and a second API-key header.
3. Save the run, then reopen it and inspect the run detail returned by the platform.
4. Start the run and inspect the captured requests.

**Expected Outcome:**

- The headers are stored and sent with every request the engine makes to the target API.
- The header values are never returned in any read response, so a credential entered once does not leak back out through the interface.

**Result:** Pass.

### Test Case 48: Custom Header Validation

**Test Scenario:** A user enters header values that would be unsafe to forward.

**Steps:**

1. Add a header whose name contains a space.
2. Add a header whose value contains a line break.
3. Add twenty-one headers.

**Expected Outcome:**

- The invalid header name is rejected.
- The value containing a line break is rejected, so a header value cannot be used to inject extra headers into the outgoing request.
- The twenty-first header is rejected against the stated limit.

**Result:** Pass.

### Test Case 49: Excluding Endpoints from a Run

**Test Scenario:** A user leaves out operations that are unsafe or pointless to fuzz.

**Steps:**

1. In the run form, mark two operations as excluded.
2. Start the run and let it complete.
3. Inspect the per-endpoint request summary.

**Expected Outcome:**

- The excluded operations are removed from the specification handed to the engine, so no request is generated for them.
- The remaining operations are tested normally.
- If an excluded endpoint has since been deleted from the project, the run still starts and simply ignores it.

**Result:** Pass.

---

## Module 9: Test Execution

### Test Case 50: One-Click Test Execution

**Test Scenario:** A user starts a configured run and follows its progress.

**Steps:**

1. Press Run on a configured run.
2. Stay on the page and watch the status without reloading.
3. Navigate to another page and come back.

**Expected Outcome:**

- The platform hands the specification and settings to the testing engine and returns straight away, without holding the browser.
- The status moves from pending to running to completed, and the counts of endpoints covered and test cases passed and failed appear as the run finishes.
- The interface stays usable throughout, and returning to the page shows the current state rather than a stale one.

**Result:** Pass.

### Test Case 51: Running Without a Specification, or While Already Running

**Test Scenario:** A user starts a run in circumstances where it cannot proceed.

**Steps:**

1. Delete the project's specification and press Run on an existing run configuration.
2. On a running run, press Run a second time.

**Expected Outcome:**

- The first is refused with a message asking the user to upload a specification before running a test suite.
- The second is refused with "Test suite is already running", and the live run continues undisturbed.

**Result:** Pass.

### Test Case 52: Re-running an Existing Run

**Test Scenario:** A user runs the same configuration again after fixing something in the target API.

**Steps:**

1. Open a completed run with results and captured requests.
2. Press Run again and let it finish.
3. Inspect the results and the captured request list.

**Expected Outcome:**

- The previous results, test cases and captured requests for that run record are cleared before the new execution begins.
- The displayed results always belong to the most recent execution, never a mixture of two.

**Result:** Pass.

### Test Case 53: Engine Failure Handling

**Test Scenario:** A run cannot complete because the target or the engine is unavailable.

**Steps:**

1. Configure a run against an unreachable target URL and start it.
2. Separately, start a healthy run and stop the engine process while it is running.
3. Check the target API for continued traffic afterwards.

**Expected Outcome:**

- The run is marked as failed with the reason recorded, rather than being left showing "running" forever.
- The failure and its reason are shown on the run page.
- The engine's whole process tree is terminated, so no orphaned process keeps sending requests to the target API after the run ends.

**Result:** Pass.

---

## Module 10: Captured Requests and Inspection

### Test Case 54: Per-Endpoint Request Summary

**Test Scenario:** A user reviews how many requests a run sent to each operation and how they turned out.

**Steps:**

1. Open a completed run's request list.

**Expected Outcome:**

- Each endpoint has one row showing how many requests were sent to it and how those split across the 2xx, 3xx, 4xx and 5xx response classes.
- Requests that did not match any known operation are collected in a separate bucket, which is itself a finding: it means the engine mutated the HTTP method.
- Matched endpoints are listed first, with the unmatched bucket last.

**Result:** Pass.

### Test Case 55: Browse and Filter Captured Requests

**Test Scenario:** A user drills into one endpoint's requests and narrows them down.

**Steps:**

1. Open one endpoint's captured requests.
2. Page through the list.
3. Filter by one specific response code from the dropdown.
4. Copy the resulting URL and open it in a new tab.

**Expected Outcome:**

- Requests are listed in the order they were sent and are paginated so a run with thousands of requests still loads quickly.
- The response-code filter offers only the codes this run actually produced, and returns exactly the matching requests.
- The filtered view reopens unchanged from its URL, so a particular view can be shared with a teammate.

**Result:** Pass.

### Test Case 56: Inspect a Single Request and Response

**Test Scenario:** A user examines exactly what was sent and what came back.

**Steps:**

1. Open one captured request from the list.

**Expected Outcome:**

- The full request is shown as it was sent: method, URL, headers and body.
- The full response is shown as it was received: status code, headers, body and how long it took.
- A body too large to store in full is clearly marked as truncated, rather than presented as if it were complete.

**Result:** Pass.

### Test Case 57: Copy a Request as curl

**Test Scenario:** A user reproduces a captured request outside the platform.

**Steps:**

1. Press "Copy as curl" on a captured request and paste it into a terminal.
2. Repeat on a request whose body was truncated.

**Expected Outcome:**

- A valid curl command reproducing the request is copied, with connection-level headers omitted so that curl computes them correctly itself.
- For a truncated request, the copied command carries a warning that its body is incomplete and will not faithfully reproduce the original.

**Result:** Pass.

### Test Case 58: Re-run a Single Captured Request

**Test Scenario:** A user resends one recorded request against the live API to see whether the behaviour has changed.

**Steps:**

1. As a tester, press Run on a single captured request.
2. As a viewer, attempt the same.
3. As a tester, attempt it on a request whose body was truncated.

**Expected Outcome:**

- The tester receives a fresh live response shown beside the recorded one, and nothing is written to the run's history.
- The viewer is refused, because this makes a real outbound call that can change data in the target API.
- The truncated request is refused with an explanation rather than sent in an incomplete form.

**Result:** Pass.

---

## Module 11: AI-Generated Request Descriptions

### Test Case 59: Explain Requests

**Test Scenario:** A user asks the platform to describe, in plain language, what each generated request was testing.

**Steps:**

1. Open a completed run and press "Explain requests".
2. Wait for the pass to finish, watching the progress indicator.
3. Read the Description column in the request list.

**Expected Outcome:**

- Each request gains a single plain sentence describing what it tests, for example "Sends a title longer than the declared 50-character maximum".
- Progress is reported as the pass runs, and it continues automatically until every request has been described.
- Descriptions state the intent of the test, so the same request reads the same way whether it passed or failed.

**Result:** Pass.

### Test Case 60: Interrupted and Repeated Description Passes

**Test Scenario:** A description pass is interrupted, and later resumed.

**Steps:**

1. Start a description pass on a run with many requests and navigate away before it finishes.
2. Return and press "Explain requests" again.
3. Press it once more after every request has a description.

**Expected Outcome:**

- The second press continues from where the first stopped instead of starting over.
- Requests that already have a description are never sent to the model again, so no work already paid for is repeated.
- If the AI provider stops responding mid-pass, the descriptions already produced are kept and the user is told how many were completed.

**Result:** Pass.

### Test Case 61: Descriptions Without an AI Provider Configured

**Test Scenario:** The platform is asked to describe requests when no AI credentials are available.

**Steps:**

1. Clear the API key for the report and explanation scope in the admin settings.
2. Press "Explain requests" on a completed run.

**Expected Outcome:**

- The request is refused with a clear message stating that the AI provider is not configured and where the key can be set.
- Nothing is written, and the existing descriptions are untouched.

**Result:** Pass.

---

## Module 12: Reports, Analytics and Export

### Test Case 62: View a Run Report

**Test Scenario:** A user reviews the outcome of a completed run.

**Steps:**

1. Open the report for a completed run.

**Expected Outcome:**

- The overview shows how many endpoints were covered out of the total and as a percentage, the pass rate, the total, passed and failed test-case counts, and how long the run took.
- The distribution of response codes across the whole run is shown.
- Per-endpoint outcomes are listed, with a separate list of failures and a flag on any endpoint that produced server errors.

**Result:** Pass.

### Test Case 63: Report Availability

**Test Scenario:** A user opens the report of a run that has not finished.

**Steps:**

1. Request the report of a run that is still running.
2. Request the report of a run that failed.

**Expected Outcome:**

- Both are refused with a message naming the run's current status, rather than showing empty or partial figures.
- The report becomes available as soon as the run completes.

**Result:** Pass.

### Test Case 64: Explain Failures

**Test Scenario:** A user asks for plain-language explanations of the run's failures.

**Steps:**

1. Press "Explain failures" on a run with failures.
2. Wait for the explanations to appear.
3. Press it a second time.

**Expected Outcome:**

- Each failed endpoint gains a short explanation of the likely cause, written in plain language.
- The second press reuses explanations already produced and only fills in the ones still missing, so an interrupted first attempt can simply be repeated.

**Result:** Pass.

### Test Case 65: Export the Report as CSV

**Test Scenario:** A user takes the run's results away for their own analysis.

**Steps:**

1. Export the report as CSV and open the file in a spreadsheet.

**Expected Outcome:**

- The file downloads with a filename identifying the run.
- It contains the run's per-endpoint results accurately and opens cleanly in a spreadsheet application.

**Result:** Pass.

### Test Case 66: Export the Report as PDF

**Test Scenario:** A user produces a shareable document of the run's results.

**Steps:**

1. Export the report as PDF and open it.
2. Request an export in an unsupported format.

**Expected Outcome:**

- A readable PDF of the run's results downloads and opens correctly.
- The unsupported format is rejected with a message stating that the format must be CSV or PDF.

**Result:** Pass.

---

## Module 13: Replay and Run History

### Test Case 67: Replay a Completed Run

**Test Scenario:** A user re-sends a recorded run's exact request sequence to check whether the API still behaves the same way.

**Steps:**

1. Press Replay on a completed run.
2. Watch the replay run to completion.
3. Return to the original run.

**Expected Outcome:**

- A new run is created, marked as a replay, and the original run's captured requests are re-sent in their recorded order against the target.
- No AI generation is involved, so the replay is a deterministic regression check rather than a fresh set of tests.
- The original run's results are never overwritten, and both runs remain available side by side.

**Result:** Pass.

### Test Case 68: Replay Constraints

**Test Scenario:** A user attempts to replay in circumstances that need special handling.

**Steps:**

1. Replay a run that captured no requests.
2. Replay a replay.
3. Replay a run that is currently running.

**Expected Outcome:**

- The first is refused with a message that the run has no captured requests to replay.
- Replaying a replay re-sends the original run's fixed sequence, so every replay in a chain stays directly comparable to its siblings.
- The third is refused because the run is already in progress.

**Result:** Pass.

### Test Case 69: Run History and Comparison

**Test Scenario:** A user compares a run against its replays to spot a regression over time.

**Steps:**

1. Open the history panel for a run that has several replays.
2. Read the pass and fail counts along the timeline.

**Expected Outcome:**

- The original run and every replay of it are listed oldest first, each with its outcome counts.
- A change in behaviour between two points in time is visible at a glance, because every entry sent the same fixed request sequence.

**Result:** Pass.

---

## Module 14: Team Collaboration and Role-Based Access

### Test Case 70: Invite a Collaborator

**Test Scenario:** A project administrator brings a teammate into the project.

**Steps:**

1. Open the Team tab and invite an email address with the tester role.
2. Check the invitation list and the invited person's inbox.

**Expected Outcome:**

- A pending invitation is created with a unique token, valid for seven days.
- An invitation email is sent to the address, and the invitation is listed as pending on the Team tab.

**Result:** Pass.

### Test Case 71: Invitation Constraints

**Test Scenario:** An administrator sends invitations that should not be accepted.

**Steps:**

1. Invite the same address twice.
2. Invite the project owner.
3. Invite someone who is already a member.

**Expected Outcome:**

- Each attempt is refused with its own message: an invitation is already outstanding, the person is the project owner, or the person is already a member.
- Only one outstanding invitation per address per project can exist.

**Result:** Pass.

### Test Case 72: Accept an Invitation

**Test Scenario:** An invited user joins the project.

**Steps:**

1. Sign in as the invited user and open the Invitations page.
2. Accept the invitation.
3. Open the project.

**Expected Outcome:**

- The user becomes a member with exactly the role they were invited with, no more.
- The invitation is marked accepted, and the project appears in the user's project list.

**Result:** Pass.

### Test Case 73: Invitation Security and Expiry

**Test Scenario:** Someone tries to use an invitation that is not theirs, or is no longer valid.

**Steps:**

1. While signed in as one account, attempt to accept an invitation addressed to a different email address.
2. Attempt to accept an invitation that has passed its seven-day expiry.
3. Attempt to accept an invitation that has already been accepted or declined.

**Expected Outcome:**

- The wrong recipient is refused, so an invitation link alone is not enough to join a project.
- An expired invitation is refused with a message saying so.
- An invitation that has already been resolved cannot be used again.

**Result:** Pass.

### Test Case 74: Resend, Revoke and Decline an Invitation

**Test Scenario:** An administrator manages outstanding invitations, and an invitee turns one down.

**Steps:**

1. Resend a pending invitation.
2. Revoke a different pending invitation and try its link afterwards.
3. As an invitee, decline a third invitation.

**Expected Outcome:**

- Resending re-sends the email for the same invitation, and reports clearly if the email could not be sent.
- A revoked invitation is removed and its link no longer works.
- A declined invitation is marked declined and creates no membership.

**Result:** Pass.

### Test Case 75: Role Enforcement: Viewer

**Test Scenario:** A viewer confirms they can read everything and change nothing.

**Steps:**

1. As a viewer, attempt to upload a specification, add an endpoint, configure a run, start a run, replay a run, build a dependency graph, re-run a single captured request, and invite a member.
2. As the same viewer, open the specification, endpoints, dependency graph, run results, captured requests and reports.

**Expected Outcome:**

- Every attempt to change something is refused with a permission message.
- Every read succeeds, so a viewer is a genuinely useful read-only role rather than a locked-out one.

**Result:** Pass.

### Test Case 76: Role Enforcement: Tester and Administrator

**Test Scenario:** A tester and an administrator confirm the boundary between their roles.

**Steps:**

1. As a tester, configure and start a run, replay it, re-run a single captured request, build the dependency graph and request explanations.
2. As the same tester, attempt to upload a specification, delete a run, delete an endpoint and manage members.
3. Repeat both groups as a project administrator.
4. As a project administrator, attempt to delete the project.

**Expected Outcome:**

- The tester can do everything in the first group and is refused for everything in the second.
- The administrator can do both groups.
- Deleting the project remains with the owner alone, even for an administrator.

**Result:** Pass.

### Test Case 77: Manage Members

**Test Scenario:** An administrator adjusts the team, and a member leaves.

**Steps:**

1. Change a member's role from viewer to tester.
2. Remove a member from the project.
3. As a member, leave the project.
4. As the owner, attempt to leave.

**Expected Outcome:**

- The role change takes effect on the member's very next action.
- A removed member loses access to the project immediately.
- A member can leave on their own initiative.
- The owner is told to delete the project instead of leaving it, so a project is never left without an owner.

**Result:** Pass.

---

## Module 15: Platform Administration

### Test Case 78: Access to the AI Provider Settings

**Test Scenario:** An ordinary user and a platform administrator each open the provider settings page.

**Steps:**

1. Open the AI settings page as an ordinary signed-in user.
2. Open the same page as an account on the platform's administrator list.

**Expected Outcome:**

- The ordinary user is refused with an "Admin access required" message.
- The administrator sees all three AI surfaces the platform uses: the testing engine, specification generation, and report explanations.

**Result:** Pass.

### Test Case 79: Update and Clear AI Provider Settings

**Test Scenario:** An administrator points a feature at a different AI provider without redeploying.

**Steps:**

1. Change the model, base URL, requests-per-minute limit and API key for one surface, and save.
2. Use the corresponding feature and observe which provider it calls.
3. Clear one of the fields and save again, then use the feature once more.

**Expected Outcome:**

- The change takes effect immediately, with no restart or redeployment.
- The feature runs against the newly configured provider.
- A cleared field falls back to that surface's configured environment default rather than being treated as an empty value.

**Result:** Pass.

### Test Case 80: AI Provider Settings Validation

**Test Scenario:** An administrator enters values outside the accepted range.

**Steps:**

1. Enter a base URL with no scheme.
2. Enter a requests-per-minute limit of 2000, then of -1.

**Expected Outcome:**

- Each value is rejected with its own message.
- The previously saved settings remain in force, so an invalid entry cannot break a working configuration.

**Result:** Pass.

### Test Case 81: Shared Rate Pacing Across AI Features

**Test Scenario:** Two AI-backed features are used at the same time against a provider with a strict per-minute limit.

**Steps:**

1. Set a low requests-per-minute limit for the report and explanation surface.
2. Start "Explain failures" and "Explain requests" at close to the same time.
3. Watch both passes to completion.

**Expected Outcome:**

- The two features queue behind one shared budget instead of each pacing itself independently.
- The provider's per-minute limit is never exceeded, and neither pass fails with a rate-limit error.
- Both passes complete, one after the other.

**Result:** Pass.

---

## Module 16: Notifications, Security and Cross-Cutting Behaviour

### Test Case 82: Transactional Email

**Test Scenario:** The three repeatable emails the platform sends are delivered, and a mail outage is survived.

**Steps:**

1. Complete a signup, send an invitation, and let a test run finish.
2. Make the mail provider unavailable and repeat the invitation and the test run.

**Expected Outcome:**

- The confirmation code, the invitation and the run-finished notice are each delivered.
- When mail cannot be sent, the failure is recorded but never fails the action that triggered it: the run still completes and the invitation is still created.

**Result:** Pass.

### Test Case 83: Rejecting Unknown Fields and Malformed Identifiers

**Test Scenario:** A caller sends data the platform does not expect.

**Steps:**

1. Send any request with an extra field the endpoint does not declare.
2. Open a project route using an identifier that is not a valid UUID.

**Expected Outcome:**

- Both are rejected before any business logic runs.
- An unexpected field is never silently ignored and never silently stored.

**Result:** Pass.

### Test Case 84: Cross-Project and Cross-Run Isolation

**Test Scenario:** A member of one project uses identifiers belonging to another.

**Steps:**

1. Sign in as a member of project B only.
2. Request a run, a captured request and a report belonging to project A, using project B's URL.

**Expected Outcome:**

- Every attempt reports not found.
- A run is always scoped to the project named in its own address, so identifiers cannot be used to reach across projects.

**Result:** Pass.

### Test Case 85: Credentials Never Leave the Deployment

**Test Scenario:** A user checks that the secrets they entered are not echoed back or forwarded.

**Steps:**

1. Configure a run with an Authorization header and inspect the run detail the platform returns.
2. Run a description pass and inspect what is sent to the AI provider.

**Expected Outcome:**

- The custom header values are absent from every read response.
- The request sent to the AI provider records only whether an Authorization header was present, never its value.
- The target API's response body is not sent to the AI provider at all.

**Result:** Pass.

### Test Case 86: Concurrent Use by Multiple Users

**Test Scenario:** Several people use the platform at the same time.

**Steps:**

1. With two accounts, start test runs in two different projects at the same time.
2. While those run, start a specification generation in a third project.
3. Watch the status on all three.

**Expected Outcome:**

- Test runs are queued by the engine and complete in turn, without interfering with each other's results.
- Specification generation runs on its own queue and does not block the test runs.
- Each user sees accurate live status for their own work throughout.

**Result:** Pass.

### Test Case 87: Interface Consistency and Usability

**Test Scenario:** A user moves around the application and checks that it behaves consistently.

**Steps:**

1. Switch between light and dark themes.
2. Use the project switcher to move between projects from any page.
3. Trigger a failing action, such as an invalid upload, and read the message shown.
4. Open the landing page while already signed in.

**Expected Outcome:**

- The theme applies consistently across every page and is remembered.
- The project switcher moves between projects from anywhere without losing the current tab.
- Failures are reported as readable notifications naming what went wrong, not raw error codes.
- A signed-in user opening the landing page is taken to their dashboard.

**Result:** Pass.

---

## 5. Test summary

A total of 87 test cases were executed across 16 functional modules. The distribution and outcome per module are given below.

| Module | Test Cases | Passed | Failed |
|--------|:----------:|:------:|:------:|
| Authentication and Account Verification | 13 | 13 | 0 |
| Account and Profile Management | 5 | 5 | 0 |
| Project Management | 5 | 5 | 0 |
| API Specification Management | 6 | 6 | 0 |
| AI Specification Generation from Source Code | 5 | 5 | 0 |
| Endpoint Management | 4 | 4 | 0 |
| Dependency Graph Visualisation | 5 | 5 | 0 |
| Test Run Configuration | 6 | 6 | 0 |
| Test Execution | 4 | 4 | 0 |
| Captured Requests and Inspection | 5 | 5 | 0 |
| AI-Generated Request Descriptions | 3 | 3 | 0 |
| Reports, Analytics and Export | 5 | 5 | 0 |
| Replay and Run History | 3 | 3 | 0 |
| Team Collaboration and Role-Based Access | 8 | 8 | 0 |
| Platform Administration | 4 | 4 | 0 |
| Notifications, Security and Cross-Cutting Behaviour | 6 | 6 | 0 |
| **Total** | **87** | **87** | **0** |

*Table 1: Test execution summary by module*

---

## 6. Conclusion

All 87 test cases passed. The platform behaves correctly along the normal path of every feature and, just as importantly, along the boundaries around it: invalid specifications are rejected with actionable messages rather than accepted and failed later; permissions are enforced consistently at the point of the write rather than only hidden in the interface; long-running work reports its progress honestly and cannot be started twice; and credentials entered into the platform do not come back out of it.

Two areas deserve particular note. First, the destructive actions - deleting a project, deleting an account, replacing a specification, re-running a completed run - were each verified to be either confirmed with the account password or to leave the artefacts that must survive them intact; a replaced specification, for instance, removes its derived endpoints and its now-stale dependency graph but leaves completed runs and their recorded results readable. Second, the features that send live traffic to a third-party API - starting a run, replaying one, and re-sending a single captured request - were verified to be gated at the tester role or above, to terminate cleanly when a run is stopped, and never to leave a process behind still sending requests.

The AI-backed features were verified to degrade rather than fail: a description or explanation pass that is interrupted keeps what it has already produced and resumes from there, a spec whose declared schema cannot be parsed yields less specific descriptions rather than an error, and a missing provider key produces a clear message naming where to set it. On this evidence AutoRestTest satisfies the functional and non-functional requirements set out for it and is ready for demonstration and use.
