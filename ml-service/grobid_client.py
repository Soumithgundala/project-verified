import requests
from bs4 import BeautifulSoup
import re
from typing import List

GROBID_URL = "http://localhost:8070/api/processFulltextDocument"

def process_pdf_with_grobid(pdf_bytes: bytes) -> str:
    """
    Sends a PDF to the GROBID server and returns the TEI-XML string.
    """
    files = {
        'input': ('document.pdf', pdf_bytes, 'application/pdf')
    }
    # Configuration parameters for GROBID to process full text
    data = {
        'consolidateHeader': '0',
        'consolidateCitations': '0',
        'includeRawCitations': '0',
        'includeRawAffiliations': '0',
        'teiCoordinates': ''
    }
    
    try:
        response = requests.post(GROBID_URL, files=files, data=data, timeout=300)
        response.raise_for_status()
        return response.text
    except requests.exceptions.RequestException as e:
        print(f"Error communicating with GROBID: {e}")
        return None

def extract_clean_text_from_tei(tei_xml: str) -> List[str]:
    """
    Parses the TEI-XML to extract clean text.
    Filters out citations, footnotes, and bibliographic references.
    """
    if not tei_xml:
        return []

    soup = BeautifulSoup(tei_xml, 'xml') # use lxml parser for XML
    
    # 1. Remove bibliography list entirely
    for back in soup.find_all('back'):
        list_bibl = back.find('listBibl')
        if list_bibl:
            list_bibl.decompose()

    # 2. Remove footnotes
    for note in soup.find_all('note', type='foot'):
        note.decompose()

    # 3. Extract text from paragraphs, omitting inline citation references
    paragraphs = []
    
    for div in soup.find_all('div'):
        for p in div.find_all('p'):
            # Remove inline references like [1], [Smith et al., 2020]
            for ref in p.find_all('ref', type='bibr'):
                ref.decompose()
            
            # Extract text and normalize whitespace
            text = p.get_text(separator=' ')
            text = re.sub(r'\s+', ' ', text).strip()
            
            if text:
                # Basic filter: exclude very short paragraphs if needed
                # (Blueprint mentioned excluding text blocks shorter than 14 words later in matching, 
                #  but we can do a preliminary filter here to save vectorization compute)
                word_count = len(text.split())
                if word_count >= 14:
                    paragraphs.append(text)

    return paragraphs

def parse_pdf(pdf_bytes: bytes) -> List[str]:
    """
    Main entry point for parsing a PDF bytes object.
    Returns a list of cleaned paragraph strings.
    """
    tei_xml = process_pdf_with_grobid(pdf_bytes)
    if tei_xml:
        return extract_clean_text_from_tei(tei_xml)
    return []
