import requests
import os
import json

UPLOAD_URL = "http://localhost:5000/api/audit-document"
DOCX_PATH = "test_document.docx"
GITHUB_URL = "https://github.com/Soumithgundala/project-verified"

print("--- Testing Combined Audit-Document API ---")
if not os.path.exists(DOCX_PATH):
    print(f"Error: test document {DOCX_PATH} does not exist!")
    exit(1)

with open(DOCX_PATH, "rb") as f:
    files = {"document": (os.path.basename(DOCX_PATH), f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    data = {"githubUrl": GITHUB_URL}
    
    print(f"Sending POST request to {UPLOAD_URL}...")
    response = requests.post(UPLOAD_URL, files=files, data=data)

print(f"Status Code: {response.status_code}")
try:
    resp_json = response.json()
    print("Response JSON:")
    print(json.dumps(resp_json, indent=2))
except Exception as e:
    print("Failed to parse JSON response:", e)
    print("Raw response:", response.text)
