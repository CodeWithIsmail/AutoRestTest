# 2. Quality Function Deployment

## 2.1 Normal Requirements

- **User Authentication:** Secure login and sign-up processes for users to create and manage their accounts on the platform.
- **Project Management:** Users must be able to create, update, and delete API testing projects to organise their work.
- **API Specification Upload:** Users must be able to upload an OpenAPI specification file to define the API they want to test.
- **Test Execution:** The platform must be able to run automated tests against a target API based on the uploaded specification.
- **Test Result Viewing:** Users must be able to see the outcome of each test run, including which endpoints were tested and what responses were received.
- **Secure Data Storage:** All account information, uploaded specifications, and test results must be stored securely and kept private to each user.
- **Test Alerts:** Users must be notified when a test is completed, when a run fails, or when a system error occurs during execution.

## 2.2 Expected Requirements

- **Automatic Test Suite Generation:** Users expect the platform to automatically generate a comprehensive set of test cases directly from the uploaded API specification.
- **Multi-Project Dashboard:** Users expect a centralised dashboard to create, manage, and switch between multiple API testing projects.
- **Team Collaboration:** Users expect to invite team members into a project and assign roles such as admin, tester, or viewer.
- **Test Execution History:** All past test runs will be saved with their timestamps and outcomes so users can review and track API behaviour over time.
- **Test Reports and Analytics:** Users expect a detailed report after each test run showing the distribution of HTTP response codes received, any server-side failures detected, and the proportion of API endpoints that were covered.
- **Reuse Test Suites:** Users expect to save test configurations as named suites that can be re-executed in the future without reconfiguration.
- **Export Test Reports:** Users expect to download test results and reports in standard formats such as PDF or CSV for documentation and sharing.

## 2.3 Exciting Requirements

- **Automated API Specification Generation:** The system can automatically generate an OpenAPI specification from uploaded source code.
- **Test Failure Explanation:** When a test failure or server error is detected, the platform provides a plain-language description of what went wrong and which request caused it.
- **One-Click API Testing:** A single action triggers the entire testing process — from reading the API specification to generating tests, running them, and producing a report.
