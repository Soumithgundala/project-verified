from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
import uuid

# We will implement the BullMQ/Redis queue logic in Phase 2. 
# For now, we will simulate the background task logic using FastAPI's BackgroundTasks.
from grobid_client import parse_pdf

app = FastAPI(title="Plagiarism Detection ML Service")

def mock_vectorization_job(job_id: str, pdf_bytes: bytes):
    """
    Simulates the background processing that will eventually be pushed to BullMQ.
    Phase 1: PDF Extraction via GROBID.
    Phase 2: Sentence Vectorization via LaBSE.
    """
    print(f"[{job_id}] Started background processing for uploaded document.")
    
    # 1. Parse PDF using GROBID
    paragraphs = parse_pdf(pdf_bytes)
    
    if not paragraphs:
        print(f"[{job_id}] Error or empty document returned from GROBID.")
        return
        
    print(f"[{job_id}] Successfully extracted {len(paragraphs)} clean paragraphs.")
    
    # Simulate saving to DB or sending to Phase 2 (LaBSE)
    print(f"[{job_id}] Snippet of first paragraph: {paragraphs[0][:100]}...")

@app.post("/api/v1/extract")
async def extract_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Ingress gateway for document uploads.
    Returns 202 Accepted immediately with a Job ID.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    try:
        # Read the file bytes into memory
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read uploaded file: {str(e)}")

    # Generate a unique Job ID
    job_id = str(uuid.uuid4())
    
    # In Phase 2, this will be pushed to Redis/BullMQ.
    # For now, we use FastAPI's built-in background tasks to decouple the processing.
    background_tasks.add_task(mock_vectorization_job, job_id, pdf_bytes)

    # Return 202 Accepted immediately as per the blueprint
    return JSONResponse(
        status_code=202,
        content={
            "status": "Accepted",
            "job_id": job_id,
            "message": "Document uploaded successfully and queued for processing."
        }
    )

@app.get("/health")
def health_check():
    return {"status": "healthy"}
