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
from scrapingdog_scraper import extract_unique_sentences, search_scrapingdog

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


def notify_node(
    document_id: str,
    tenant_id: str,
    status: str,
    error_message: str | None = None,
    vector_count: int | None = None,
    plagiarism_report: Dict[str, Any] | None = None
) -> None:
    payload: Dict[str, Any] = {
        "documentId": document_id,
        "tenantId": tenant_id,
        "status": status
    }

    if error_message is not None:
        payload["errorMessage"] = error_message

    if vector_count is not None:
        payload["vectorCount"] = vector_count

    if plagiarism_report is not None:
        payload["plagiarismReport"] = plagiarism_report

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
    paragraphs = job_data.get("paragraphs")

    if not document_id:
        raise ValueError("Job is missing documentId.")

    if paragraphs is None and not file_path:
        raise ValueError("Job is missing both paragraphs and filePath.")

    try:
        if paragraphs is not None:
            document_paragraphs = paragraphs
        else:
            pdf_path = Path(file_path)
            if not pdf_path.exists():
                raise FileNotFoundError(f"Uploaded file not found: {file_path}")
            pdf_bytes = pdf_path.read_bytes()
            document_paragraphs = parse_pdf(pdf_bytes)

        vector_results = vectorizer_service.process_document(document_paragraphs)
        cleaned_document_text = "\n".join(document_paragraphs)
        suspect_sentences = []
        if cleaned_document_text.strip():
            suspect_sentences = extract_unique_sentences(cleaned_document_text, limit=3)

        vector_payload = build_vector_records(document_id, tenant_id, vector_results)
        plagiarism_report = None

        if vector_payload["ids"]:
            try:
                # 1. Search Live Web using ScrapingDog
                scrapingdog_api_key = os.getenv("SCRAPINGDOG_API")
                web_matched_sentences = []
                unique_web_sources = set()

                if scrapingdog_api_key and suspect_sentences:
                    for sentence in suspect_sentences:
                        print(f"Checking web for: {sentence[:50]}...")
                        search_results = search_scrapingdog(sentence, scrapingdog_api_key)
                        if search_results:
                            print("🚨 MATCH FOUND ON LIVE WEB!")
                            for res in search_results:
                                url = res.get("url")
                                title = res.get("title")
                                snippet = res.get("snippet")
                                if url:
                                    unique_web_sources.add(url)
                                    web_matched_sentences.append({
                                        "sentence": sentence,
                                        "matchedSentence": f"{title} — {snippet}" if title or snippet else "Google Search Match",
                                        "distance": 0.0,  # Exact search matches have 0.0 L2 distance
                                        "sourceDocumentId": url,
                                        "sourceChunkIndex": 0
                                    })

                # 2. Query ChromaDB for similar sentences before upserting this document
                query_results = collection.query(
                    query_embeddings=vector_payload["embeddings"],
                    n_results=1,
                    where={"tenant_id": tenant_id}
                )

                matched_sentences = []
                unique_sources = set()
                threshold = 0.35 # L2 distance threshold (~82.5% similarity)

                ids_list = query_results.get("ids", [])
                distances_list = query_results.get("distances", [])
                metadatas_list = query_results.get("metadatas", [])
                documents_list = query_results.get("documents", [])

                for idx, sentence in enumerate(vector_payload["documents"]):
                    if idx < len(distances_list) and distances_list[idx]:
                        distance = distances_list[idx][0]
                        metadata = metadatas_list[idx][0]
                        matched_doc = documents_list[idx][0]

                        # Exclude self-matches (safeguard)
                        if metadata.get("document_id") == document_id:
                            continue

                        if distance <= threshold:
                            matched_sentences.append({
                                "sentence": sentence,
                                "matchedSentence": matched_doc,
                                "distance": float(distance),
                                "sourceDocumentId": metadata.get("document_id"),
                                "sourceChunkIndex": int(metadata.get("chunk_index"))
                            })
                            unique_sources.add(metadata.get("document_id"))

                # 3. Combine web matches and local matches
                for match in web_matched_sentences:
                    matched_sentences.append(match)
                for url in unique_web_sources:
                    unique_sources.add(url)

                # 4. Calculate score based on unique matching sentences from the uploaded document
                matched_uploaded_sentences = set()
                for match in matched_sentences:
                    matched_uploaded_sentences.add(match["sentence"])

                total_sentences = len(vector_payload["documents"])
                plagiarism_score = (len(matched_uploaded_sentences) / total_sentences * 100) if total_sentences > 0 else 0.0

                plagiarism_report = {
                    "plagiarismScore": round(plagiarism_score, 2),
                    "matchedSentencesCount": len(matched_uploaded_sentences),
                    "totalSentencesCount": total_sentences,
                    "matchedSentences": matched_sentences[:20], # limit payload size
                    "sourcesCount": len(unique_sources)
                }
            except Exception as e:
                print(f"Error checking plagiarism: {e}")

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
            vector_count=len(vector_payload["ids"]),
            plagiarism_report=plagiarism_report
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
        "connection": REDIS_URL,
        "lockDuration": 300000,
        "concurrency": 1
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
