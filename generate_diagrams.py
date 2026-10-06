import urllib.request
import base64

def download_mermaid(mermaid_code, filename):
    print(f'Generating {filename}...')
    # Encode to base64 for mermaid.ink
    # mermaid.ink requires standard base64 but URL safe
    encoded = base64.urlsafe_b64encode(mermaid_code.encode('utf-8')).decode('utf-8')
    url = f'https://mermaid.ink/img/{encoded}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open(filename, 'wb') as out_file:
        out_file.write(response.read())
    print(f'Saved {filename}')

flow1 = """
flowchart TD
    A([Start: Create Test Suite]) --> B[Initialize Engine]
    B --> C[Parse Target OpenAPI Spec]
    C --> D[Initialize RL Agents]
    D --> E[Generate Test Sequence]
    E --> F[Execute HTTP Requests against API]
    F --> G[Collect Responses & Status Codes]
    G --> H{Budget Exhausted?}
    H -- No --> E
    H -- Yes --> I[Compile Final Report]
    I --> J([End: Save & Complete])
"""

flow2 = """
flowchart TD
    A([Start: Provide Project Source Code]) --> B[Upload ZIP Archive]
    B --> C[Extract to Staging Folder]
    C --> D[OOPS LLM Engine Analyzes Code]
    D --> E[Identify Routes, Models & Controllers]
    E --> F[Generate OpenAPI 3.0 YAML/JSON]
    F --> G{User Reviews Spec}
    G -- Needs Edit --> F
    G -- Approved --> H[Save Spec to Database]
    H --> I([End: Spec Ready for Testing])
"""

download_mermaid(flow1, 'resources/SRS/testing_workflow.png')
download_mermaid(flow2, 'resources/SRS/oas_generation.png')
