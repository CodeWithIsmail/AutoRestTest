# 6. Data-Based Modeling

Database modeling describes how the platform's persistent data is structured and
related. AutoRestTest uses a relational schema on **PostgreSQL**, accessed
through the **Prisma** ORM. The model comprises nine entities and four
enumerated types.

## 6.1 ER Diagram and Schemas

Entity Relationships:

- A **User** can own many **Projects**.
- A **User** can belong to many **Projects** through **ProjectMember**, a
  many-to-many association that carries the member's role (each row pairs one
  user with one project).
- A **Project** can have many **ProjectInvitations**, and each invitation is
  sent by one **User**.
- A **Project** has at most one **ApiSpecification**.
- A **Project** contains many **Endpoints**.
- A **Project** can have many **TestSuites**, and each **TestSuite** is
  triggered by one **User**.
- A **TestSuite** produces many **TestCases**, and each **TestCase** tests one
  **Endpoint**.
- A **TestSuite** captures many **RequestLogs**, and each **RequestLog** maps to
  at most one **Endpoint**.

ER Relationship Summary:

@fig er-data-model.png | Entity Relationship Diagram (Chen notation)

**Table: Database schemas.** `PK` = primary key, `FK` = foreign key,
`→` = references. All identifiers are UUID strings.

| Schema | Attribute | Type |
|--------|-----------|------|
| **User** | id (PK) | TEXT (UUID) |
|  | username | TEXT, UNIQUE |
|  | email | TEXT, UNIQUE |
|  | password | TEXT (bcrypt hash) |
|  | createdAt | TIMESTAMP |
|  | updatedAt | TIMESTAMP |
| **Project** | id (PK) | TEXT (UUID) |
|  | name | TEXT |
|  | description | TEXT (nullable) |
|  | ownerId (FK) | TEXT → User |
|  | createdAt | TIMESTAMP |
|  | updatedAt | TIMESTAMP |
| **ProjectMember** | id (PK) | TEXT (UUID) |
|  | projectId (FK) | TEXT → Project |
|  | userId (FK) | TEXT → User |
|  | role | ENUM(admin, tester, viewer) |
|  | joinedAt | TIMESTAMP |
| **ProjectInvitation** | id (PK) | TEXT (UUID) |
|  | projectId (FK) | TEXT → Project |
|  | email | TEXT |
|  | role | ENUM(admin, tester, viewer) |
|  | token | TEXT, UNIQUE |
|  | status | ENUM(pending, accepted, declined, expired) |
|  | invitedById (FK) | TEXT → User |
|  | expiresAt | TIMESTAMP |
|  | createdAt | TIMESTAMP |
| **ApiSpecification** | id (PK) | TEXT (UUID) |
|  | projectId (FK) | TEXT → Project, UNIQUE |
|  | fileName | TEXT |
|  | fileContent | TEXT (raw OpenAPI 3.0) |
|  | generatedByAI | BOOLEAN |
|  | uploadedAt | TIMESTAMP |
| **Endpoint** | id (PK) | TEXT (UUID) |
|  | projectId (FK) | TEXT → Project |
|  | path | TEXT |
|  | method | ENUM(GET, POST, PUT, PATCH, DELETE) |
|  | description | TEXT (nullable) |
|  | addedManually | BOOLEAN |
|  | createdAt | TIMESTAMP |
| **TestSuite** | id (PK) | TEXT (UUID) |
|  | projectId (FK) | TEXT → Project |
|  | name | TEXT (nullable) |
|  | status | ENUM(pending, running, completed, failed) |
|  | jobId | TEXT (nullable) |
|  | targetUrl | TEXT |
|  | timeBudget | INTEGER |
|  | mutationRate | DOUBLE PRECISION |
|  | totalEndpoints | INTEGER |
|  | coveredEndpoints | INTEGER |
|  | totalTestCases | INTEGER |
|  | passedTestCases | INTEGER |
|  | failedTestCases | INTEGER |
|  | triggeredById (FK) | TEXT → User |
|  | startedAt | TIMESTAMP (nullable) |
|  | completedAt | TIMESTAMP (nullable) |
|  | createdAt | TIMESTAMP |
| **TestCase** | id (PK) | TEXT (UUID) |
|  | testSuiteId (FK) | TEXT → TestSuite |
|  | endpointId (FK) | TEXT → Endpoint |
|  | requestBody | JSONB (nullable) |
|  | requestHeaders | JSONB (nullable) |
|  | statusCode | INTEGER (nullable) |
|  | responseBody | JSONB (nullable) |
|  | responseTimeMs | INTEGER (nullable) |
|  | passed | BOOLEAN |
|  | failureExplanation | TEXT (nullable) |
|  | createdAt | TIMESTAMP |
| **RequestLog** | id (PK) | TEXT (UUID) |
|  | testSuiteId (FK) | TEXT → TestSuite |
|  | endpointId (FK) | TEXT → Endpoint (nullable) |
|  | seq | INTEGER |
|  | method | TEXT |
|  | path | TEXT |
|  | url | TEXT |
|  | statusCode | INTEGER (nullable) |
|  | durationMs | INTEGER (nullable) |
|  | requestHeaders | JSONB (nullable) |
|  | requestBody | TEXT (nullable) |
|  | requestTruncated | BOOLEAN |
|  | responseHeaders | JSONB (nullable) |
|  | responseBody | TEXT (nullable) |
|  | responseTruncated | BOOLEAN |
|  | createdAt | TIMESTAMP |
