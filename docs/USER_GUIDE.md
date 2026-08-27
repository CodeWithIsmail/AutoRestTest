# AutoRestTest — User Guide

AutoRestTest is a web-based, AI-powered, collaborative platform for automated
REST API testing. This guide walks through every page and feature of the
application, in the order a new user would typically encounter them.

> **Looking for something else?**
> [`API.md`](API.md) is the REST API reference · [`TEST_REPORT.md`](TEST_REPORT.md)
> is the test report · [`../RUNNING.md`](../RUNNING.md) covers local setup and
> deployment.

---

## Contents

- [Introduction](#introduction)
- [System requirements](#system-requirements)
- [Accessing AutoRestTest](#accessing-autoresttest)
- [Creating an account](#creating-an-account)
  - [Registering](#registering) · [Verifying your email](#verifying-your-email)
- [Logging in](#logging-in) · [Forgot password](#forgot-password)
- [The application layout](#the-application-layout)
- [Projects](#projects)
  - [Viewing your projects](#viewing-your-projects) · [Creating a project](#creating-a-project) · [Editing or deleting a project](#editing-or-deleting-a-project)
- [Project roles and permissions](#project-roles-and-permissions)
- [Project overview tab](#project-overview-tab)
- [API specification](#api-specification)
  - [Uploading an OpenAPI file](#uploading-an-openapi-file) · [Generating a specification from source code](#generating-a-specification-from-source-code)
- [Endpoints](#endpoints)
- [Dependency graph](#dependency-graph)
- [Test suites (test runs)](#test-suites-test-runs)
  - [Creating a new run](#creating-a-new-run) · [Running and monitoring](#running-and-monitoring-a-test-run) · [Viewing the report](#viewing-the-test-report) · [Exporting](#exporting-reports) · [Replaying](#replaying-a-run)
- [Captured requests and live request runs](#captured-requests-and-live-request-runs)
- [Team and collaboration](#team-and-collaboration)
  - [Managing members](#managing-members) · [Inviting teammates](#inviting-team-members) · [My invitations](#my-invitations)
- [Account settings](#account-settings)
- [Logging out](#logging-out)
- [Frequently asked questions](#frequently-asked-questions)

---

## Introduction

AutoRestTest brings together several capabilities that are normally spread
across separate tools into a single project workspace:

- **API specification management** — upload an existing OpenAPI 3.0 document,
  or generate one automatically by uploading a zip of the API's source code.
- **Dependency visualization** — a semantic dependency graph shows which API
  operations rely on data produced by other operations, before a single request
  is ever sent.
- **AI-driven test execution** — a multi-agent reinforcement-learning and
  LLM-backed engine generates and runs a test suite against a live target API,
  with real-time status and a detailed report.
- **Team collaboration** — invite teammates to a project with a specific role
  (Admin, Tester, or Viewer) and work together on the same specification,
  endpoints, and test runs.

## System requirements

- A modern web browser (Google Chrome, Firefox, Microsoft Edge, or Safari).
- An internet connection.
- An AutoRestTest account (registered through the application itself).
- For AI specification generation from source code: the source code packaged as
  a single `.zip` archive, up to 50 MB.

No installation is required on your computer — the entire platform runs in the
browser.

## Accessing AutoRestTest

Open your browser and navigate to the AutoRestTest URL provided to you. If you
are not already signed in, the application takes you directly to the Login page.

<!-- screenshot: login page -->

## Creating an account

### Registering

If you do not already have an account, you can create one from the Login page.

1. On the Login page, click **Create one** next to "Don't have an account?".
2. Fill in the registration form:
   - **Username** — a unique name, 3–32 characters. This becomes your permanent
     sign-in name and **cannot be changed later**.
   - **Email** — a valid email address you have access to.
   - **Password** — at least 8 characters.
3. Click **Create account**.

Registration does not create your account immediately — it only reserves it.
AutoRestTest sends a six-digit verification code to the email address you
entered, and you are taken to the **Confirm Your Email** screen.

<!-- screenshot: registration form -->

### Verifying your email

The Confirm Your Email screen shows six input boxes for the code that was
emailed to you. Typing (or pasting) the code fills the boxes automatically and,
once all six digits are entered, the form submits itself — there is no separate
button to click. **Your account is only created at this step**, once the code is
verified.

- If you did not receive the code, use the **Resend the code** link. Once used,
  it is disabled for 60 seconds before it can be used again.
- If you entered the wrong email address, use **Sign up again** to restart
  registration.
- The code expires after 24 hours, and five incorrect attempts invalidate it —
  request a new one rather than guessing.

On success you are signed in automatically and taken straight to your Projects
page. There is no separate account-approval step and no unverified state to
wait out.

<!-- screenshot: email verification screen -->

## Logging in

1. On the Login page, enter your **email address or username** — a single
   combined field accepts either — and your **password**.
2. Click **Sign in**.
3. If your credentials are correct, you are taken directly into the
   application, on your Projects page.

<!-- screenshot: login page -->

### Forgot password

If you have forgotten your password, click **Forgot your password?** on the
Login page.

1. Enter the email address on your account and click **Send reset link**.
2. Check your inbox for a reset link. For security, the screen shows the same
   confirmation message whether or not the address is registered, so it cannot
   be used to discover which emails have an account.
3. The link **works once and expires after 30 minutes**.
4. Opening the link takes you to the **Choose a New Password** screen, where you
   enter and confirm a new password (at least 8 characters, and the two entries
   must match).

Resetting your password signs you out of **every** device and browser you were
previously signed in on, including the one you are using now — sign in again
with your new password.

<!-- screenshot: forgot password and reset password screens -->

## The application layout

After signing in, the application uses a single top bar for all navigation —
there is no sidebar. From left to right, the top bar contains:

- The **AutoRestTest logo**, which always returns to your Projects list.
- The **project switcher**, visible whenever you are inside a project; shows the
  current project's name and lets you jump directly to any other project without
  returning to the list first.
- The **invitations bell**, shown only when you have at least one pending
  project invitation, with a badge showing how many.
- Your **display name**, and a light/dark **theme toggle**.
- The **account menu**, opened from your avatar, with links to Invitations,
  Settings, and Sign out.

<!-- screenshot: application top bar -->

## Projects

The Projects page is what you see immediately after signing in — it is the
application's home page. Each project is an independent workspace holding one
API specification, its endpoints, its dependency graph, its test runs, and its
team.

### Viewing your projects

The Projects page offers:

- A **search box**, which filters by project name or description.
- A **role filter**, with options All roles, Owner, Admin, Tester, and Viewer.
- A **view toggle**, switching between a Table view and a Cards view; your
  choice is remembered for next time.

The table view's columns — Name, Members, Role, and Last activity — can each be
clicked to sort the list; clicking the same column again reverses the sort
order. A **Status** column shows badges for the project's specification state
(No spec / Spec uploaded / Spec generated), any AI generation in progress
(Generating… / Awaiting review / Generation failed), and the status of its most
recent test run.

<!-- screenshot: projects page, table view -->

### Creating a project

1. Click **+ New Project**.
2. Enter a **Name** (required) and, optionally, a **Description**.
3. Click **Create project**.

You are taken directly into the new project, on its Overview tab.

<!-- screenshot: new project dialog -->

### Editing or deleting a project

Only a project's **owner** can edit or delete it. From the project's own page,
use the **Edit** and **Delete** buttons next to the project name; from the
Projects list, open the row menu on a project you own.

Deleting a project **requires your account password** in the confirmation
dialog — a signed-in session alone is not enough for something this
irreversible. It permanently removes the project and everything in it: its
specification, endpoints, dependency graph, test runs, and captured requests.

## Project roles and permissions

Every project has one owner and any number of members, each holding one of three
roles. Permissions are enforced both in the interface and on the server.

| Role | Can do |
|------|--------|
| **Owner** | Everything below, plus rename or delete the project itself, and manage all members. |
| **Admin** | Manage the API specification and endpoints; configure, run, and manage test suites; build the dependency graph; manage team members and invitations. |
| **Tester** | Configure and trigger test runs, replay them, describe their requests, and build the dependency graph. Cannot change the specification, endpoints, or team, and cannot delete runs. |
| **Viewer** | Read-only access to everything in the project — cannot change or run anything. |

The owner is the project's creator, is never listed as an ordinary member, and
cannot be removed or demoted.

## Project overview tab

Opening a project lands on its Overview tab. A tab row beneath the project name
— **Overview, API Spec, Endpoints, Dependencies, Test Suites, Team** — switches
between the project's sections; it stays visible throughout.

The Overview tab shows the project's description, its owner, member count,
creation date, and last-updated date, alongside a short list of its team (owner
and members, each with a role badge).

<!-- screenshot: project overview tab -->

## API specification

The **API Spec** tab is where a project's OpenAPI document lives. Project owners
and admins are offered two ways to provide one, selected with a toggle at the
top of the page: **Upload OAS file**, or **Generate from source code**. Testers
and viewers see only the specification that is currently in place.

### Uploading an OpenAPI file

1. Select **Upload OAS file**.
2. Drag an OpenAPI document onto the drop zone, or click it to browse for a
   file. Accepted formats are `.json`, `.yaml`, and `.yml`, describing an
   OpenAPI 3.x document, up to 5 MB.

Endpoints are extracted automatically as soon as the file is accepted. If the
project already has a specification, uploading a new one asks for confirmation
first, since replacing it re-extracts the endpoint list and **removes any
endpoints that were added manually**.

Once a specification is in place, its card shows the document's title, its
OpenAPI version, an **AI-generated** badge if it came from the code-generation
flow below, its endpoint count, and its upload date — along with **Replace** and
**Delete** buttons. The raw specification text is shown below, with buttons to
copy it or download it as a file.

<!-- screenshot: API Spec tab with an uploaded specification -->

### Generating a specification from source code

If a project does not yet have an OpenAPI specification, AutoRestTest can
generate one automatically by reading the API's own source code with an AI
pipeline.

1. Select **Generate from source code**.
2. Fill in the **API title** and **Version** (both prefilled from the project's
   own name and `1.0.0`), and optionally adjust **Exclude directories** — a
   comma-separated list of folders to skip. Vendored dependencies and build
   output are pre-filled, since excluding them makes the analysis considerably
   faster and cheaper.
3. Drag the project's source code onto the drop zone as a single `.zip` archive
   (up to 50 MB), or click to browse for one.

Generation runs in the background and **can take a long time** for a large
codebase — the page shows a progress bar, the current step, and an elapsed-time
counter, and updates automatically, so it is safe to leave the page and come
back later. A **Cancel** button discards a generation that is still running.

Once generation finishes, the specification is shown **for review before it
changes anything in the project**. Any warnings from the pipeline — for example,
a note that a required tool was unavailable and a lower-fidelity conversion was
used — are shown alongside it. Clicking **Review generated spec** expands the
full generated document. From here you can either **Discard** the result, or
click **Use this specification** to apply it as the project's specification (if
one already existed, this asks for confirmation first, for the same reason as
replacing an uploaded file).

<!-- screenshot: specification generation in progress, and the review screen -->

## Endpoints

The **Endpoints** tab lists every operation extracted from the project's
specification, plus any added manually. A search box filters by path, method, or
description.

Each row shows:

- An **HTTP method badge** (GET, POST, PUT, PATCH, DELETE, …).
- The endpoint's **path**, with inline indicators for whether authentication is
  required, how many parameters it takes, and whether it accepts a request body.
- Its **description**.
- A **Source** badge — "From spec" for endpoints extracted from the uploaded or
  generated specification, or "Manual" for ones added by hand.

Clicking a row expands its full detail directly beneath it: authentication
requirements, every parameter (with where it is sent — path, query, header, or
cookie — its type, and whether it is required), the request body schema with an
example payload, and the documented responses.

Project owners and admins can add an endpoint manually with **+ Add endpoint** —
choosing a Method, entering a Path, and optionally a Description — for cases the
specification does not cover. Manual endpoints can also be deleted from the row
menu.

<!-- screenshot: endpoints tab, with a row expanded -->

## Dependency graph

The **Dependencies** tab visualizes the Semantic Property Dependency Graph the
engine builds from the specification. A dependency from one operation to another
means the first is believed to **produce a value the second one needs** — for
example, from "create a resource" to "fetch that resource by id", because the id
one returns is what the other expects as input.

Building the graph only reads the specification; **it never sends any request to
the API itself.**

1. Click **Build dependency graph** (available to admins and testers; viewers
   ask a teammate with one of those roles). This takes roughly a minute, since
   the engine compares every operation against every other one.
2. Once built, the graph can be rebuilt at any time with **Rebuild** on the same
   tab. Rebuilding clears the previous graph first, so you never see a stale one
   presented as a fresh result.

### Reading the view

A summary line above the diagram gives the whole graph's shape at a glance:
how many **operations** it covers, how many **dependencies** it found, how many
**entry points** there are (operations that nothing else feeds, and therefore
natural places for a test sequence to start), and how many **cycles** — pairs of
operations that each need something the other produces.

Below that, the view shows **one operation's own dependencies at a time**, in
three columns:

- **Left** — the operations that *produce* values this one needs.
- **Centre** — the operation you are focused on.
- **Right** — the operations that *consume* values this one produces.

Arrows always run producer → consumer, so they read in execution order. The
number on an arrow is its strength: a **similarity score** on a
specification-derived graph, or the **confidence the reinforcement-learning
agent actually learned** once a test run has exercised it.

To move around:

- The **list on the left** shows every operation, **sorted by how connected it
  is** rather than alphabetically — so the busiest, most interesting operation
  is the first row, and it is also what the view opens on. Each row shows how
  many dependencies that operation *needs* and *gives*.
- The **search box** above the list filters it by path or method.
- **Click any operation in the diagram** to move the focus to it and see its own
  dependencies.
- A heavily connected operation shows its first eight neighbours on each side
  and folds the rest into a **show N more** control; expanding lists them all.

> **Why there is no whole-graph picture.** A real API's resolved dependency
> graph is hub-and-spoke — on a 76-operation sample specification, 49 of its 69
> dependencies leave a single operation. Drawn all at once that is an unreadable
> fan, no matter the layout. One operation's own neighbourhood is small (usually
> one to three others) and legible, so that is what the view draws. A
> 500-operation API therefore renders exactly as fast and as clearly as a
> 10-operation one.

On a completed run's report, the same view appears scoped to that run, with a
**View captured requests →** link taking you from the focused operation straight
to what was actually sent to it.

<!-- screenshot: dependency graph with an operation focused -->

## Test suites (test runs)

The **Test Suites** tab is where AI-generated test runs are configured,
executed, and reviewed. Each entry in its table is one run: its name (or a short
generated id), status, target URL, pass/total result once complete, and creation
date.

### Creating a new run

1. Click **+ New run**.
2. Optionally give the run a **Name**.
3. Enter the **Target URL** — the live base URL the engine will send requests to.
4. Set the **Time budget** in seconds (1–3600; default 30) — how long the AI
   engine is allowed to spend generating and sending requests.
5. Optionally set a **Mutation rate** between 0 and 1, controlling how
   aggressively the engine varies generated values.
6. Expand **Advanced: Custom headers** to attach up to **20** HTTP headers to
   every request the run sends — for example an `Authorization` header for Basic
   or Bearer authentication, or an API-key header the target expects. Each row
   is a free-form key and value; common header names are suggested as you type.
7. Click **Create** to save the run.

A newly created run starts in the **Pending** state and has not sent any
requests yet.

<!-- screenshot: new test run dialog, with custom headers expanded -->

### Running and monitoring a test run

Open a pending run and click **Run tests** to start it. While running, the page
polls automatically every few seconds and needs no manual refresh.

| Status | Meaning |
|--------|---------|
| **Pending** | Configured, but not yet started. |
| **Running** | The AI engine is actively generating and sending requests to the target. |
| **Completed** | The run finished and produced a report. |
| **Failed** | The run could not complete — for example because the target URL was unreachable or the engine service was unavailable. It can be retried. |

<!-- screenshot: a run in progress -->

### Viewing the test report

Once a run completes, its page shows a full report.

> A run's job is finding **real defects**, not just checking for a non-2xx
> response. A request that receives a **4xx** means the API correctly rejected a
> bad request; a **5xx** server error is the genuine fault signal.

The headline banner reflects this directly, reporting the number of faults (5xx
responses) detected, or confirming that none were found. Below the banner:

- A **KPI row** — coverage percentage, endpoints covered, total requests sent,
  and the breakdown of successful (2xx), client-error (4xx), and server-error
  (5xx) responses.
- A **status-code distribution chart** showing the same breakdown visually.
- A **per-endpoint results table** listing every endpoint the run exercised,
  with a Result badge (Successful / Client error / Server error), the exact
  status codes returned, and any failure explanation generated for it. It can be
  filtered by search term, outcome, or exact status code.
- An **Explain failures** button, for a completed run whose report has failures,
  which asks the AI to generate a plain-language explanation of what likely
  caused each failure and which request triggered it.
- An **Explain requests** button, which writes a one-sentence plain-language
  description of what each captured request was testing ("Test with an empty
  title field") into the request list's Description column. This is a
  readability layer only — nothing is re-run and no result changes. It works
  through the run in batches and shows progress, so a large run takes several
  minutes; it is safe to leave and resume.
- The **dependency graph** described above, scoped to this run — which lets you
  see exactly which dependencies the reinforcement-learning agent confirmed
  while generating this particular run's requests.

<!-- screenshot: completed run report -->

### Exporting reports

A completed run offers **Export CSV** and **Export PDF** buttons, each of which
downloads the run's report in that format for sharing outside the application.

### Replaying a run

A completed run can be replayed with the **Replay** button: this resends that
run's exact captured requests, in the same order, as a new, separate run — with
**no new AI generation involved**. This is useful for confirming whether a fix
actually resolved a previously-detected fault, since it is an apples-to-apples
comparison against the same requests.

A run's page shows a **Run History** panel listing its original run and every
replay of it, so results can be compared side by side. Replaying a replay still
resends the *original* run's requests, so every entry in the history stays
directly comparable.

<!-- screenshot: run history panel comparing an original run and its replays -->

## Captured requests and live request runs

From a completed run's report, clicking **View all captured requests** — or
**View** next to a specific endpoint, or an operation in the run's dependency
graph — opens the full list of every request the engine actually sent during
that run. The list can be filtered by endpoint and by response status class
(2xx/3xx/4xx/5xx) or an exact status code, and is paginated 50 rows at a time.

Expanding a request shows the complete exchange: the request's method, URL,
headers, and body on one side, and the response's status, duration, headers, and
body on the other. A **Copy as curl** button builds a ready-to-run curl command
from the captured request.

A **Run** button lets an admin or tester resend that exact request to the target
API **right now**, and shows the fresh response inline as a *Live response*,
without leaving the page. Nothing is saved — the live response is not added to
the run's results. Because a non-GET/HEAD request can have real side effects on
the target system, running anything other than a GET or HEAD request asks for
confirmation first.

<!-- screenshot: a captured request expanded, showing a live re-run -->

## Team and collaboration

### Managing members

The **Team** tab (and the shorter team list on the Overview tab) shows everyone
with access to the project: the owner, then every other member with their role.
Owners and admins can change another member's role (Admin, Tester, or Viewer)
directly from a dropdown next to their name, or remove them from the project
with **Remove**. Any member can leave a project they no longer need access to
with **Leave**.

<!-- screenshot: team tab with the member list -->

### Inviting team members

1. On the Team tab, click **+ Invite** (owners and admins only).
2. Enter the teammate's **Email** address and choose a **Role** — Admin, Tester,
   or Viewer, each with a short description of what it allows.
3. Click **Send invite**.

The invitation is emailed to that address and **expires after seven days**.
Pending invitations are listed on the Team tab with their role, expiry date, and
status; each can be resent, have its invite token copied, or be revoked before
it is accepted.

<!-- screenshot: invite teammate dialog -->

### My invitations

Invitations addressed to the signed-in user's own account — from any project —
are collected on the **Invitations** page, reached from the bell icon or account
menu in the top bar. Each shows the project, the offered role, who sent it, and
when it expires, with **Accept** and **Decline** buttons. Accepting takes you
directly into the project.

<!-- screenshot: my invitations page -->

## Account settings

The **Settings** page, reached from the account menu, is organized into four
sections.

### Profile

Choose an avatar colour and set an optional **Display name**. Your **Username**
and **Email** are shown read-only — the username is what you sign in with and
cannot be changed, and every account on the platform is always verified, so no
separate verification badge or step applies here. Click **Save changes** once
you have made an edit.

### Password

Change your password by entering your **Current password** and a **New
password** (entered twice to confirm). Changing your password signs you out of
every device, including the one you used to change it — you will need to sign in
again with the new password.

### Notifications

Two checkboxes control optional email notifications and are saved the instant
you toggle them: **Test run finished** (an email when a run you started
completes or fails) and **Project invitations** (an email when someone invites
you to a project — invitations still appear inside the application either way).

Security emails — verification codes, password-reset links, and password-change
confirmations — are always sent and cannot be turned off.

### Deleting your account

The **Danger Zone** section offers **Delete my account**. Since deleting your
account also deletes every project you own — along with its specification, test
runs, and captured requests, and removes your teammates' access to them — the
confirmation dialog states exactly how many owned projects will be lost, and
requires your current password before proceeding. **This action cannot be
undone.**

<!-- screenshot: account settings page -->

## Logging out

To end your session, open the account menu from your avatar in the top bar and
click **Sign out**. You are returned to the Login page.

## Frequently asked questions

**I registered but never got my six-digit code. What do I do?**
Use the **Resend the code** link on the verification screen — it is available
again 60 seconds after the previous send. If the address was mistyped, use
**Sign up again** to restart with the correct one.

**Why can't I change my username?**
A username is the identity you sign in with, so AutoRestTest treats it as
permanent once an account is created. You can still set a separate **Display
name** in Settings, which is what teammates see around the app.

**Generating a specification from my source code is taking a very long time. Is something wrong?**
Not necessarily. The pipeline reads your source code and calls an AI model to
infer the specification, and large codebases can take a long time end-to-end.
The page updates automatically, so it is safe to leave and come back later.
Excluding vendored and build directories in the **Exclude directories** field
before starting makes it noticeably faster.

**My completed run shows some 4xx responses. Is that a failure?**
Not on its own. AutoRestTest treats a 4xx response as the API correctly
rejecting a request it considered invalid — it is only counted as a fault when
the API returns a **5xx** server error, which indicates the API failed to handle
the request at all.

**What is the difference between re-running a run and replaying it?**
Running a pending run uses the AI engine to generate new requests. **Replay**,
available on a completed run, instead resends that exact same set of previously
captured requests, in the same order, as a new run with no new generation —
useful for confirming whether a fix actually resolved a fault.

**Why does the dependency graph only show one operation at a time?**
Because a whole-graph drawing of a real API is unreadable. Most operations
depend on a handful of others, but a few hub operations are connected to
dozens — drawn all at once the picture is a fan of arrows that says nothing.
Focusing on one operation keeps the diagram small and exact no matter how large
the API is; the summary line above it still reports the whole graph's shape.

**I accidentally deleted a project, a test run, or an endpoint. Can I get it back?**
No. Every delete in AutoRestTest is permanent and cannot be undone, which is why
each one asks for confirmation first — and why deleting a project or an account
also asks for your password.

**Can I invite someone who doesn't have an AutoRestTest account yet?**
Yes. An invitation is sent to an email address, not an existing account; the
recipient can register (or sign in, if they already have an account under that
address) and then find the invitation waiting on their own **Invitations** page.

**Why is the "Run" button disabled on a captured request?**
Resending a live request is limited to project Admins and Testers. Viewers can
see every captured request but cannot trigger new ones against the live target
API. The button is also disabled on a request whose body was too large to store
in full, since resending an incomplete body would not faithfully reproduce it.
