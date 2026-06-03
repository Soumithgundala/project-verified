import sys
import os

# Ensure the current directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from vectorizer import segment_and_filter_sentences, vectorizer_service

def test_ml_pipeline():
    print("=== Testing spaCy Sentence Segmentation & 14-word Threshold ===")
    
    # Define test paragraphs
    test_paragraphs = [
        # Short sentence (10 words) - should be excluded
        "This is a very short sentence with only ten words.",
        
        # Long sentence (16 words) - should be preserved
        "The plagiarism detection system will accurately analyze academic documents to identify matching content blocks efficiently.",
        
        # Abbreviation sentence (18 words) - spaCy should not split at "Dr." or "Fig."
        "According to Dr. Smith and Fig. 1, the experiment proved successful in all trials conducted by the team."
    ]
    
    print("Input Paragraphs:")
    for i, p in enumerate(test_paragraphs):
        print(f"  {i+1}: {p}")
        
    print("\nSegmenting and filtering...")
    filtered = segment_and_filter_sentences(test_paragraphs)
    
    print("\nResulting Sentences:")
    for i, s in enumerate(filtered):
        print(f"  {i+1}: {s} (Word count: {len(s.split())})")
        
    # Validation checks
    assert len(filtered) == 2, f"Expected 2 sentences, but got {len(filtered)}"
    assert "short" not in filtered[0], "Short sentence should have been filtered out"
    assert "Dr. Smith" in filtered[1], "Abbreviated sentence should have been preserved as a single sentence"
    
    print("\n=== Testing LaBSE Model Loading & Dense Vector Generation ===")
    # Initialize LaBSE model
    vectorizer_service.load_model()
    
    # Process documents
    results = vectorizer_service.process_document(test_paragraphs)
    
    print(f"\nSuccessfully processed! Generated {len(results)} vector mappings.")
    for res in results:
        sentence = res["sentence"]
        vector = res["vector"]
        print(f"\nSentence: \"{sentence}\"")
        print(f"Vector dimensions: {len(vector)}")
        print(f"Vector (first 5 elements): {vector[:5]}")
        
        assert len(vector) == 768, f"Expected 768-dimensional vector, but got {len(vector)}"
        
    print("\nAll checks passed successfully!")

if __name__ == "__main__":
    try:
        test_ml_pipeline()
    except Exception as e:
        print(f"\nTest failed with error: {e}")
        sys.exit(1)
