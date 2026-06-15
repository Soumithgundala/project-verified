import os
import requests
import spacy
from pathlib import Path

# Load environment variables from server/.env if available
def load_env():
    # Look for .env in current directory or in server directory (one level up)
    current_dir = Path(__file__).resolve().parent
    paths_to_try = [
        current_dir / ".env",
        current_dir.parent / "server" / ".env",
    ]
    for path in paths_to_try:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        if "=" in line:
                            key, val = line.split("=", 1)
                            # Strip quotes if present
                            key = key.strip()
                            val = val.strip().strip("'\"")
                            if key not in os.environ:
                                os.environ[key] = val
            break

load_env()

# Load spaCy to identify complex sentences
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    from spacy.cli import download
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

def extract_unique_sentences(text_or_list, limit=3):
    """Extract the most complex sentences to search for plagiarism."""
    if not text_or_list:
        return []
    
    if isinstance(text_or_list, list):
        sentences = text_or_list
    else:
        doc = nlp(text_or_list)
        sentences = [sent.text.strip() for sent in doc.sents]
        
    scored_sentences = []
    for sent in sentences:
        sent_doc = nlp(sent)
        words = sent.split()
        if len(words) > 10:  
            # Score complexity based on length + number of named entities
            score = len(sent_doc.ents) + len(words)
            scored_sentences.append((score, sent))
    
    # Sort by complexity and grab the top 'limit' sentences
    scored_sentences.sort(reverse=True, key=lambda x: x[0])
    return [sent[1] for sent in scored_sentences[:limit]]

def search_scrapingdog(suspicious_sentence, api_key):
    """Search Google via ScrapingDog API for exact sentence matches."""
    url = "https://api.scrapingdog.com/google/"
    
    # Enclose sentence in quotes for exact match search
    query = f'"{suspicious_sentence}"'
    
    params = {
        "api_key": api_key,
        "query": query,
        "results": "3", # We only need the top 3 results to verify
        "country": "us" 
    }
    
    try:
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            results = []
            
            # Extract organic results from ScrapingDog's parsed JSON
            if "organic_results" in data:
                for r in data["organic_results"]:
                    results.append({
                        "title": r.get("title"),
                        "url": r.get("link"),
                        "snippet": r.get("snippet")
                    })
            return results
        else:
            print(f"ScrapingDog API Error: {response.status_code} - {response.text}")
            return []
    except Exception as e:
        print(f"Request failed: {e}")
        return []
