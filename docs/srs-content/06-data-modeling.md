# 6. Data-Based Modeling

Data-based modeling identifies the information the AutoRestTest platform must
store and manage, independent of how the software is built. Following the
Pressman / Coad-Yourdon analysis method, we begin by listing every noun that
appears in the requirement statements and usage scenarios, separate the nouns
that belong to the **problem space** from those that belong only to the
**solution space**, distil the problem-space nouns into a set of **data
objects**, describe the **relationships** between those objects, capture them in
an **Entity-Relationship (ER) diagram**, and finally give the concrete
**schema** of each object.

## 6.1 Noun Listing

Every noun drawn from the requirements is listed below and marked in the
*Problem / Solution Space* column:

- **P (Problem Space)** — a concept essential to the application domain; it
  becomes a data object or an attribute of one.
- **S (Solution Space)** — a concept tied to a specific interface, action,
  external system, or file format; it does not, by itself, become stored data.

| SL | Noun | Attributes | P / S |
|----|------|------------|-------|
| 1  | Access | | S |
| 2  | Account | | S |
| 3  | Admin | | P |
| 4  | Alert | | S |
| 5  | Analytics report | response-code distribution, coverage, server-failure count | P |
| 6  | API | | S |
| 7  | API specification | file name, file content, generated-by-AI flag, upload time | P |
| 8  | Authentication | | S |
| 9  | Collaboration | | S |
| 10 | Coverage | | P |
| 11 | Credentials | | S |
| 12 | CSV | | S |
| 13 | Dashboard | | S |
| 14 | Description | | P |
| 15 | Email | | P |
| 16 | Endpoint | path, HTTP method, description, added-manually flag | P |
| 17 | Engine | | S |
| 18 | Error | | S |
| 19 | Expiry | | P |
| 20 | Failure explanation | | P |
| 21 | File | | P |
| 22 | Filter | | S |
| 23 | HTTP method | | P |
| 24 | Invitation | email, role, token, status, expiry | P |
| 25 | Job | | S |
| 26 | Link | | S |
| 27 | LLM API | | S |
| 28 | Login | | S |
| 29 | Member | role, join time | P |
| 30 | Mutation rate | | P |
| 31 | Name | | P |
| 32 | Notification | | S |
| 33 | Operation | | S |
| 34 | Outcome | | P |
| 35 | Owner | | P |
| 36 | Password | | P |
| 37 | Path | | P |
| 38 | PDF | | S |
| 39 | Platform | | S |
| 40 | Progress indicator | | S |
| 41 | Project | name, description, creation time | P |
| 42 | Report | | P |
| 43 | Request | method, path, URL, headers, body | P |
| 44 | Request body | | P |
| 45 | Request header | | P |
| 46 | Response | status code, headers, body, response time | P |
| 47 | Response code | | P |
| 48 | Role | | P |
| 49 | Session | | S |
| 50 | Sign up | | S |
| 51 | Source code | | S |
| 52 | Status | | P |
| 53 | Target API | | S |
| 54 | Target URL | | P |
| 55 | Team | | S |
| 56 | Test case | request, response, pass/fail, failure explanation | P |
| 57 | Test suite | name, status, target URL, time budget, mutation rate, result summary | P |
| 58 | Tester | | P |
| 59 | Time budget | | P |
| 60 | Timestamp | | P |
| 61 | Token | | P |
| 62 | URL | | P |
| 63 | User | username, email, password | P |
| 64 | Username | | P |
| 65 | Viewer | | P |
| 66 | Workspace | | S |
| 67 | YAML | | S |

## 6.2 Probable Data Objects

Consolidating the problem-space nouns — merging synonyms (*account → user*,
*run → test suite*, *operation → endpoint*) and promoting the recurring,
data-bearing concepts to objects — yields the following data objects. Roles
(*admin, tester, viewer*) collapse into a `role` attribute, and the status
concepts collapse into `status` attributes.

| SL | Data Object | Attributes |
|----|-------------|------------|
| 1 | **User** | id, username, email, password, createdAt, updatedAt |
| 2 | **Project** | id, name, description, ownerId, createdAt, updatedAt |
| 3 | **ProjectMember** | id, projectId, userId, role, joinedAt |
| 4 | **ProjectInvitation** | id, projectId, email, role, token, status, invitedById, expiresAt, createdAt |
| 5 | **ApiSpecification** | id, projectId, fileName, fileContent, generatedByAI, uploadedAt |
| 6 | **Endpoint** | id, projectId, path, method, description, addedManually, createdAt |
| 7 | **TestSuite** | id, projectId, name, status, jobId, targetUrl, timeBudget, mutationRate, result-summary counts, triggeredById, startedAt, completedAt, createdAt |
| 8 | **TestCase** | id, testSuiteId, endpointId, requestBody, requestHeaders, statusCode, responseBody, responseTimeMs, passed, failureExplanation, createdAt |
| 9 | **RequestLog** | id, testSuiteId, endpointId, seq, method, path, url, statusCode, durationMs, request/response headers & bodies, createdAt |

> **Derived object — Report.** The *analytics report* noun does not become a
> stored object: a report (HTTP response-code distribution, endpoint coverage,
> server-failure count, failure explanations) is **computed on demand** from a
> `TestSuite` together with its `TestCase` and `RequestLog` rows. It is therefore
> a *derived* data object rather than a persistent one.

## 6.3 Relationship Between Data Objects

| Parent Object | Relationship | Child Object | Cardinality |
|---------------|--------------|--------------|-------------|
| User | owns | Project | 1 : N |
| Project | has | ProjectMember | 1 : N |
| User | is (referenced by) | ProjectMember | 1 : N |
| Project | has | ProjectInvitation | 1 : N |
| User | sends | ProjectInvitation | 1 : N |
| Project | has | ApiSpecification | 1 : 1 |
| Project | contains | Endpoint | 1 : N |
| Project | has | TestSuite | 1 : N |
| User | triggers | TestSuite | 1 : N |
| TestSuite | produces | TestCase | 1 : N |
| Endpoint | tested by | TestCase | 1 : N |
| TestSuite | captures | RequestLog | 1 : N |
| Endpoint | maps | RequestLog | 1 : N |

*User and Project hold a many-to-many collaboration association that is resolved
through the **ProjectMember** associative object (each row pairs one user with
one project and carries the member's role).*

## 6.4 ER Diagram

@fig er-data-model.png | Entity-Relationship diagram (Chen notation)

The diagram models the nine persistent entities as rectangles, their
relationships as diamonds, and their attributes as ovals with primary keys
underlined; the 1 / N cardinalities are shown on the connecting edges.

## 6.5 Schema

The concrete schema of each data object, with data types. `PK` = primary key,
`FK` = foreign key, `U` = unique. All identifiers are UUID strings.

**User**

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| username | String | U |
| email | String | U |
| password | String | bcrypt hash |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**Project**

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| name | String | |
| description | String | nullable |
| ownerId | UUID (String) | FK → User |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**ProjectMember**

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| projectId | UUID (String) | FK → Project |
| userId | UUID (String) | FK → User |
| role | Enum { admin, tester, viewer } | |
| joinedAt | DateTime | |
| (projectId, userId) | | U (composite) |

**ProjectInvitation**

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| projectId | UUID (String) | FK → Project |
| email | String | |
| role | Enum { admin, tester, viewer } | |
| token | String | U |
| status | Enum { pending, accepted, declined, expired } | default pending |
| invitedById | UUID (String) | FK → User |
| expiresAt | DateTime | |
| createdAt | DateTime | |
| (projectId, email) | | U (composite) |

**ApiSpecification**

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| projectId | UUID (String) | FK → Project, U (1 : 1) |
| fileName | String | |
| fileContent | Text | raw OpenAPI 3.0 YAML |
| generatedByAI | Boolean | default false |
| uploadedAt | DateTime | |

**Endpoint**

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| projectId | UUID (String) | FK → Project |
| path | String | e.g. `/users/{id}` |
| method | Enum { GET, POST, PUT, PATCH, DELETE } | |
| description | String | nullable |
| addedManually | Boolean | default false |
| createdAt | DateTime | |
| (projectId, method, path) | | U (composite) |

**TestSuite** *(the test-run record — one row per execution)*

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| projectId | UUID (String) | FK → Project |
| name | String | nullable |
| status | Enum { pending, running, completed, failed } | default pending |
| jobId | String | nullable — async engine job |
| targetUrl | String | |
| timeBudget | Integer | seconds |
| mutationRate | Float | default 0.2 |
| totalEndpoints | Integer | result summary |
| coveredEndpoints | Integer | result summary |
| totalTestCases | Integer | result summary |
| passedTestCases | Integer | result summary |
| failedTestCases | Integer | result summary |
| triggeredById | UUID (String) | FK → User |
| startedAt | DateTime | nullable |
| completedAt | DateTime | nullable |
| createdAt | DateTime | |

**TestCase** *(per-endpoint request/response outcome)*

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| testSuiteId | UUID (String) | FK → TestSuite |
| endpointId | UUID (String) | FK → Endpoint |
| requestBody | JSON | nullable |
| requestHeaders | JSON | nullable |
| statusCode | Integer | nullable |
| responseBody | JSON | nullable |
| responseTimeMs | Integer | nullable |
| passed | Boolean | default false |
| failureExplanation | String | nullable — LLM-generated |
| createdAt | DateTime | |

**RequestLog** *(every individual request captured by the recording proxy)*

| Attribute | Data type | Key / Notes |
|-----------|-----------|-------------|
| id | UUID (String) | PK |
| testSuiteId | UUID (String) | FK → TestSuite |
| endpointId | UUID (String) | FK → Endpoint, nullable |
| seq | Integer | order within the run |
| method | String | |
| path | String | concrete path hit |
| url | String | full forwarded URL |
| statusCode | Integer | nullable |
| durationMs | Integer | nullable |
| requestHeaders | JSON | nullable |
| requestBody | Text | nullable |
| requestTruncated | Boolean | default false |
| responseHeaders | JSON | nullable |
| responseBody | Text | nullable |
| responseTruncated | Boolean | default false |
| createdAt | DateTime | |
