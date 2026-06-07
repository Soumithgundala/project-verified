import requests
import sqlite3
import time
import os
import chromadb

# Configuration
UPLOAD_URL = "http://localhost:5000/api/documents/upload"
DB_PATH = os.path.abspath("server/.cache/gitpulse.db")
CHROMA_PATH = os.path.abspath("chroma_data")
DOCX_PATH = "test_document.docx"

print("--- Step 1: Uploading DOCX to Node.js API ---")
if not os.path.exists(DOCX_PATH):
    print(f"Error: test document {DOCX_PATH} does not exist!")
    exit(1)

with open(DOCX_PATH, "rb") as f:
    files = {"document": (os.path.basename(DOCX_PATH), f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    # By default, request goes to resolveTenantId. If no tenant header is sent, it goes to default tenant.
    response = requests.post(UPLOAD_URL, files=files)

print(f"Status Code: {response.status_code}")
try:
    resp_json = response.json()
    print("Response JSON:", resp_json)
except Exception as e:
    print("Failed to parse JSON response:", e)
    print("Raw response:", response.text)
    exit(1)

if response.status_code != 202 or not resp_json.get("success"):
    print("Error: Upload failed or was not accepted with 202.")
    exit(1)

doc_id = resp_json.get("documentId")
print(f"Successfully uploaded! Document ID: {doc_id}")

print("\n--- Step 2: Waiting for background vectorization (spaCy, LaBSE, ChromaDB) ---")
# Give the queue and model some time to process
time.sleep(8)

print("\n--- Step 3: Checking SQLite database for status and plagiarism report ---")
if not os.path.exists(DB_PATH):
    print(f"Error: SQLite database at {DB_PATH} not found!")
    exit(1)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT id, filename, status, error_message, completed_at, plagiarism_report FROM document_ingestions WHERE id = ?", (doc_id,))
row = cursor.fetchone()
conn.close()

if not row:
    print("Error: No row found in document_ingestions for this ID.")
    exit(1)

db_id, filename, status, err_msg, completed_at, plag_report = row
print(f"Document ID: {db_id}")
print(f"Filename: {filename}")
print(f"Status: {status}")
print(f"Error Message: {err_msg}")
print(f"Completed At: {completed_at}")
print(f"Raw Plagiarism Report in DB: {plag_report}")

if status != "completed":
    print(f"Warning: Status is {status}, not completed. Check logs.")
else:
    print("Success: SQLite status updated to 'completed'!")

print("\n--- Step 3.5: Fetching Document Ingestion Details via GET API ---")
api_url = f"http://localhost:5000/api/documents/{doc_id}"
try:
    api_resp = requests.get(api_url)
    print(f"GET API Status Code: {api_resp.status_code}")
    if api_resp.status_code == 200:
        api_data = api_resp.json()
        print("GET API Response:")
        import json
        print(json.dumps(api_data, indent=2))
    else:
        print(f"Failed to fetch via GET API: {api_resp.text}")
except Exception as e:
    print(f"Error calling GET API: {e}")

print("\n--- Step 4: Querying ChromaDB for vectors ---")
if not os.path.exists(CHROMA_PATH):
    print(f"Error: ChromaDB directory at {CHROMA_PATH} not found!")
    exit(1)

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
try:
    collection = chroma_client.get_collection(name="plagiarism_vectors")
    # Fetch vectors for this document
    results = collection.get(
        where={"document_id": doc_id},
        include=["documents", "metadatas"]
    )
    
    ids = results.get("ids", [])
    documents = results.get("documents", [])
    metadatas = results.get("metadatas", [])
    
    print(f"Found {len(ids)} chunks in ChromaDB for document_id '{doc_id}':")
    for i in range(len(ids)):
        print(f"  Chunk {i+1}:")
        print(f"    ID: {ids[i]}")
        print(f"    Document (Text): {documents[i]}")
        print(f"    Metadata: {metadatas[i]}")
except Exception as e:
    print("Error querying ChromaDB:", e)
