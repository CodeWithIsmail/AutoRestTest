1. Introduction  
   As modern web services grow increasingly dependent on REST APIs, ensuring the correctness and reliability of these APIs has become a critical concern for development teams. Testing REST APIs is a challenging and time-consuming task — as APIs grow in size and complexity, exploring all possible inputs, operation sequences, and edge cases manually becomes impractical, repetitive, and error-prone. Existing automated testing tools often fall short in handling the interdependencies between API operations, leading to incomplete test coverage and reduced effectiveness in detecting faults. At the same time, teams working in continuous development workflows need a shared environment where testing activities, results, and project data can be organised, stored, and reused collaboratively. This report delves into the detailed requirements for AutoRestTest, an AI-powered collaborative platform that enables development and quality assurance teams to automate REST API testing intelligently, manage multiple projects and test suites through a centralized dashboard, and work together to improve API reliability with minimal manual effort.   
2. Quality Function Deployment   
   2.1 Normal Requirements   
* User Authentication: Secure login and sign-up processes for users to create and manage their accounts on the platform.   
* Project Management: Users must be able to create, update, and delete API testing projects to organise their work.   
* API Specification Upload: Users must be able to upload an OpenAPI specification file to define the API they want to test.   
* Test Execution: The platform must be able to run automated tests against a target API based on the uploaded specification.   
* Test Result Viewing: Users must be able to see the outcome of each test run, including which endpoints were tested and what responses were received.   
* Secure Data Storage: All account information, uploaded specifications, and test results must be stored securely and kept private to each user.   
* Test Alerts: Users must be notified when a test is completed or run fails or when a system error occurs during execution.   
  2.2 Expected Requirements   
* Automatic Test Suite Generation : Users expect the platform to automatically generate a comprehensive set of test cases directly from the uploaded API specification.   
* Multi-Project Dashboard: Users expect a centralised dashboard to create, manage, and switch between multiple API testing projects.   
* Team Collaboration: Users expect to invite team members into a project and assign roles such as admin, tester, or viewer.  
* Test Execution History: All past test runs will be saved with their timestamps and outcomes so users can review and track API behaviour over time.    
* Test Reports and Analytics: Users expect a detailed report after each test run showing the distribution of HTTP response codes received, any server-side failures detected, and the proportion of API endpoints that were covered.   
* Reuse Test Suites: Users expect to save test configurations as named suites that can be re-executed in the future without reconfiguration.    
* Export Test Reports : Users expect to download test results and reports in standard formats such as PDF or CSV for documentation and sharing.    
  2.3 Exciting Requirements   
* Automated API Specification Generation : The system can automatically generate an OpenAPI specification from uploaded source code .   
* Test Failure Explanation : When a test failure or server error is detected, the platform provides a plain-language description of what went wrong and which request caused it.  
* One-Click API Testing: A single action triggers the entire testing process — from reading the API specification to generating tests, running them, and producing a report. 

3. Usage scenario (Module)  
     
   3.1. Authentication system   
     
   The system will have an authentication system with two options: sign up for new users and log in for users who already have an account.  
      
   User Sign Up   
   A new user will begin registration by visiting the platform's sign-up page and clicking the Create Account button. The user will need to provide a valid email address, a username, and a password. The system will validate the uniqueness of the username, email and the format of the email address.   
     
   User Login   
   Already registered users can log in by providing their email address and password on the login page. The system will maintain user sessions securely, allowing users to remain logged in without having to authenticate repeatedly. Users will also have the option to keep their login details saved for quicker access in future sessions.   
     
   3.2. Project Management   
     
   Once logged in, users will be taken to the main dashboard where all their projects are displayed. The system will allow users to create, manage, and organise multiple API testing projects from a single centralised interface.   
     
   Create Project   
   A user can create a new project by clicking the New Project button on the dashboard. The user will provide a project name and an optional description. Once created, the project will appear on the dashboard and the user will be taken to the project workspace where they can begin setting up their testing environment.   
     
   Manage Projects   
   The dashboard will display all projects belonging to the user along with their names, creation dates, and last activity. Users can open, rename, or delete any project from the dashboard. User can add multiple api endpoints inside a project. Deleting a project will remove all associated specifications, test suites, and results permanently, following a confirmation prompt from the system.   
     
   3.3. API Specification Management   
     
   Before testing can begin, users need to define the API they want to test. Each project may have an api specification. The system will provide two ways to do this: uploading an existing specification file or generating one automatically from source code.   
     
   Upload OpenAPI Specification   
   Users can upload an OpenAPI specification file in .yaml format directly into their project. The system will parse and validate the uploaded file and display the list of detected API endpoints and operations, making them available for test generation. If the file contains errors or is not a valid specification, the system will notify the user with a description of the problem.   
     
   Automated API Specification Generation   
   For users who do not have an existing specification file, the system will provide an option to generate one automatically. The user can upload their API source code files and the system will analyse them to produce a valid OpenAPI specification. The generated specification will be displayed for review before the user proceeds, and it can be used as the basis for testing in the same way as a manually uploaded file.   
     
   3.4. Test Suite Management   
     
   Once an API specification is available within the project, the system will allow users to generate, save, and reuse test suites for repeated testing.   
     
   Automatic Test Suite Generation   
   After a specification is uploaded or generated, the system will automatically produce a comprehensive set of test cases covering the detected API endpoints and operations. The generated test suite will be displayed to the user showing each test case, its target endpoint, and the HTTP method that will be used. Users are not required to write or configure any test cases manually.   
     
   Save and Reuse Test Suites   
   The test suite will be  saved for future use. Saved test suites will appear in the project's Test Suites section and can be re-executed at any time without regenerating or reconfiguring them. This is particularly useful for regression testing, where the same suite needs to be run repeatedly after API changes. 

   3.5. Test Execution 

   

   When a test suite is executed, the system will send automated requests to the target API, collect the responses, and track the progress in real time. 

   

   One-Click API Testing 

   The system will provide a single Run button that, when clicked, triggers the entire testing pipeline automatically. The system will read the active specification, generate test cases, execute all tests against the target API, and produce a full report — all without requiring any additional input from the user. This allows a team to run a complete API test in a single action. 

   Running Tests 

   Users can initiate a test run by selecting a test suite and clicking the Run button. The system will display a live progress indicator showing which endpoints are currently being tested and how many have been completed. Users can monitor the execution as it progresses without needing to refresh the page. 

   

   Test Alerts and Notifications 

   Once a test run is complete, the system will send the user a notification confirming completion along with a brief summary of the outcome. If the run encounters a failure — such as the target API being unreachable, an unexpected server error, or a system-level issue during execution — the user will be notified immediately with a description of what went wrong. 

   

   3.6. Test Results and Reports 

   

   After each test run, the system will store the results and provide detailed reporting and analysis options for the user to review. 

   

   Viewing Test Results 

   Users can open any completed test run to see a full breakdown of the results. The results page will show each endpoint that was tested, the HTTP method used, the response received, and whether the test passed or failed. Users can filter the results by endpoint, response status, or HTTP response code to focus on specific areas of interest. 

   

   Test Reports and Analytics 

   The system will generate a summary report for each completed test run showing the distribution of HTTP response codes received across all tested endpoints, any server-side failures that were detected, and the proportion of the API's endpoints that were covered during the run. This gives the team a complete picture of how the API performed. 

   

   Test Failure Explanation 

   When a server-side failure or unexpected response is detected, the system will provide a plain-language explanation describing which request triggered the failure, what response was received, and what the likely cause may be. This reduces the time users spend investigating and diagnosing issues after a test run. 

   

   Test Execution History 

   The system will maintain a complete history of all test runs for each project. Users can access the history from the project workspace and see a list of past executions with their timestamps, the test suite used, and a summary of outcomes. Any past run can be opened to review its full results in the same way as a recent run. 

   

   Export Test Reports 

   Users can download the results and report of any completed test run in standard formats such as PDF or CSV. The exported file will contain the full results breakdown, the analytics summary, and the details of any detected failures, allowing users to share test outcomes with stakeholders or include them in project documentation. 

   

   3.7. Team Collaboration 

   

   The system will allow multiple users to collaborate within a shared project. The project owner can invite team members and assign them roles to control what each member can see and do within the project. 

   

   Inviting Team Members 

   The project owner or an admin can invite other users to join the project by entering their email address. The invited user will receive an email notification with a link to accept the invitation. Once accepted, the user will be added to the project and it will appear on their dashboard. 

   

   Role Management 

   Each team member is assigned a role that determines their level of access. An admin can manage project settings, invite or remove members, and execute test runs. A tester can upload specifications, generate test suites, and run tests. A viewer can only see test results and reports without making any changes to the project. The project owner can update a member's role or remove them from the project at any time. 

   

                