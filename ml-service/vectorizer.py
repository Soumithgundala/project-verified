import spacy
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Attempt to load spaCy model, download if it doesn't exist
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    import spacy.cli
    logger.info("Downloading en_core_web_sm...")
    spacy.cli.download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

def segment_and_filter_sentences(paragraphs: List[str]) -> List[str]:
    """
    Splits paragraphs into sentences using spaCy and applies the 14-word threshold filter
    for the DrillBit-Extreme standard.
    """
    valid_sentences = []
    for para in paragraphs:
        doc = nlp(para)
        for sent in doc.sents:
            # Count words (excluding punctuation and whitespace)
            words = [token.text for token in sent if not token.is_punct and not token.is_space]
            if len(words) >= 14:
                valid_sentences.append(sent.text.strip())
            
    return valid_sentences

class DocumentVectorizer:
    def __init__(self):
        self.model = None

    def load_model(self):
        """Loads the LaBSE model into memory."""
        logger.info("Loading LaBSE model into memory. This may take a while...")
        # Load the Language-Agnostic BERT Sentence Embeddings (LaBSE) encoder
        self.model = SentenceTransformer('sentence-transformers/LaBSE')
        logger.info("LaBSE model loaded successfully.")

    def process_document(self, paragraphs: List[str]) -> List[Dict[str, Any]]:
        """
        Takes extracted paragraphs, segments them, filters them (>=14 words), 
        and vectorizes them using LaBSE.
        """
        if self.model is None:
            raise RuntimeError("LaBSE model is not loaded. Call load_model() first.")

        # 1 & 2: Segment sentences and apply 14-word threshold
        sentences = segment_and_filter_sentences(paragraphs)
        
        if not sentences:
            logger.info("No valid sentences found after applying the 14-word threshold.")
            return []

        # 3 & 4: Generate dense vectors (768-dimensional space)
        embeddings = self.model.encode(sentences)
        
        results = []
        for sent, emb in zip(sentences, embeddings):
            results.append({
                "sentence": sent,
                "vector": emb.tolist()
            })
            
        return results

# Global instance to be used by FastAPI lifespan
vectorizer_service = DocumentVectorizer()
