import asyncio
import hashlib
import os
import signal
from pathlib import Path
from typing import Any, Dict

import chromadb
import requests
from bullmq import Worker

from grobid_client import parse_pdf
from vectorizer import vectorizer_service

QUEUE_NAME = os.getenv("DOCUMENT_QUEUE_NAME", "document-vectorization")
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_data")
NODE_INTERNAL_BASE_URL = os.getenv("NODE_INTERNAL_BASE_URL", "http://127.0.0.1:5000")
INTERNAL_JOB_CALLBACK_SECRET = os.getenv("INTERNAL_JOB_CALLBACK_SECRET", "")
COLLECTION_NAME = "plagiarism_vectors"

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
collection = chroma_client.get_or_create_collection(name=COLLECTION_NAME)


def build_vector_records(document_id: str, tenant_id: str, vector_results: list[Dict[str, Any]]) -> Dict[str, list[Any]]:
    embeddings = []
    documents = []
    metadatas = []
    ids = []

    for chunk_index, result in enumerate(vector_results):
        sentence = (result.get("sentence") or "").strip()
        vector = result.get("vector")
        if not sentence or not vector:
            continue

        record_id = hashlib.sha256(
            f"{tenant_id}:{document_id}:{chunk_index}:{sentence}".encode("utf-8")
        ).hexdigest()

        ids.append(record_id)
        embeddings.append(vector)
        documents.append(sentence)
        metadatas.append({
            "tenant_id": tenant_id,
            "document_id": document_id,
            "chunk_index": chunk_index
        })

    return {
        "ids": ids,
        "embeddings": embeddings,
        "documents": documents,
        "metadatas": metadatas
    }


def notify_node(document_id: str, tenant_id: str, status: str, error_message: str | None = None, vector_count: int | None = None) -> None:
    payload: Dict[str, Any] = {
        "documentId": document_id,
        "tenantId": tenant_id,
        "status": status
    }

    if error_message is not None:
        payload["errorMessage"] = error_message

    if vector_count is not None:
        payload["vectorCount"] = vector_count

    headers = {}
    if INTERNAL_JOB_CALLBACK_SECRET:
        headers["x-internal-job-token"] = INTERNAL_JOB_CALLBACK_SECRET

    response = requests.post(
        f"{NODE_INTERNAL_BASE_URL.rstrip('/')}/api/internal/job-complete",
        json=payload,
        headers=headers,
        timeout=30
    )
    response.raise_for_status()


def process_job_sync(job_data: Dict[str, Any]) -> Dict[str, Any]:
    file_path = job_data.get("filePath")
    document_id = job_data.get("documentId")
    tenant_id = job_data.get("tenantId", "default")

    if not file_path or not document_id:
        raise ValueError("Job is missing filePath or documentId.")

    pdf_path = Path(file_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"Uploaded file not found: {file_path}")

    try:
        pdf_bytes = pdf_path.read_bytes()
        paragraphs = parse_pdf(pdf_bytes)
        vector_results = vectorizer_service.process_document(paragraphs)

        vector_payload = build_vector_records(document_id, tenant_id, vector_results)
        if vector_payload["ids"]:
            collection.upsert(
                ids=vector_payload["ids"],
                embeddings=vector_payload["embeddings"],
                documents=vector_payload["documents"],
                metadatas=vector_payload["metadatas"]
            )

        notify_node(
            document_id=document_id,
            tenant_id=tenant_id,
            status="completed",
            vector_count=len(vector_payload["ids"])
        )

        return {
            "documentId": document_id,
            "tenantId": tenant_id,
            "vectorCount": len(vector_payload["ids"])
        }
    except Exception as exc:
        try:
            notify_node(
                document_id=document_id,
                tenant_id=tenant_id,
                status="failed",
                error_message=str(exc)
            )
        except Exception:
            pass

        raise


async def process_job(job, job_token):
    return await asyncio.to_thread(process_job_sync, job.data)


async def main() -> None:
    vectorizer_service.load_model()

    shutdown_event = asyncio.Event()
    worker = Worker(QUEUE_NAME, process_job, {
        "connection": REDIS_URL
    })

    def handle_shutdown(signum, frame):
        shutdown_event.set()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    try:
        await shutdown_event.wait()
    finally:
        await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
