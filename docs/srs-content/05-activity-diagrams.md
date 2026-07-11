# 5. Activity Diagrams

Activity diagrams describe the dynamic behaviour of each module as a flow of
actions and decisions — from an initial state to a final state. The following
seven diagrams cover the platform's modules; decision points are shown as
diamonds and the paths are labelled with their conditions.

## 5.1 Authentication

@fig act-1.1-authentication.png | Activity diagram — Authentication

The flow branches on whether the visitor already has an account. A registered
user enters credentials and, if they are valid, is issued an authentication
token; otherwise an error is shown. A new user completes the sign-up form, which
the system validates for format and uniqueness before creating the account. Both
successful paths converge on issuing a token and redirecting to the dashboard.

## 5.2 Project & Endpoint Management

@fig act-1.2-project-endpoint.png | Activity diagram — Project & Endpoint Management

From the dashboard the user either creates a new project — supplying a name and
optional description, after which the project is created with the user as owner —
or manages an existing one. Managing a project branches into renaming/updating
it, adding an endpoint (validated for uniqueness), deleting an endpoint, or
deleting the entire project after a confirmation prompt.

## 5.3 API Specification Management

@fig act-1.3-api-specification.png | Activity diagram — API Specification Management

The user provides a specification either by uploading an OpenAPI 3.0 YAML file or
by uploading source code for the LLM to generate one. The specification is then
validated and parsed: on success the endpoints and operations are extracted and
displayed; on failure a descriptive error is returned.

## 5.4 Test Suite Management

@fig act-1.4-test-suite.png | Activity diagram — Test Suite Management

The user either generates a new suite — configuring the target URL, time budget,
and mutation rate, after which the engine generates test cases using
LLM-generated values and saves the suite — or reuses a previously saved suite.
Either path ends by displaying the test suite.

## 5.5 Test Execution

@fig act-1.5-test-execution.png | Activity diagram — Test Execution

Selecting a suite and clicking Run creates an asynchronous job. The engine
generates test cases and then loops, sending each request to the target API,
recording the response, and updating the live progress indicator. When the run
finishes, a completion alert with analytics is sent on success, or a failure
alert with the reason on error; the results and report are stored either way.

## 5.6 Test Results & Reports

@fig act-1.6-results-reports.png | Activity diagram — Test Results & Reports

After opening a completed run, the user views the per-endpoint results and can
then filter them, inspect the captured requests and responses, view the
analytics report (response-code distribution, coverage, server failures, and
LLM-generated failure explanations), or export the report as PDF/CSV.

## 5.7 Team Collaboration

@fig act-1.7-collaboration.png | Activity diagram — Team Collaboration

An owner or admin enters an invitee's email and role; the system creates a
tokened invitation and emails it. When the invited user opens the link, the flow
branches on their response — accepting adds them to the project as a member with
the assigned role (and the project appears on their dashboard), while declining
marks the invitation declined.
