# 🛡️ GitPulse: The Loophole Correction Matrix

Most plagiarism checkers (MOSS, Turnitin, Copyleaks) rely on string-based or token-based analysis. While effective for simple copy-pasting, they fail against modern "obfuscation" techniques. GitPulse is engineered to close these loopholes using structural forensics.

---

## 1. The "Rename & Reshuffle" Loophole
**The Problem:** Most checkers fail if a student renames all variables (`total` -> `x`) or reorders functions that aren't dependent on each other.
**GitPulse Correction:** 
- **AST Normalization:** We convert the code into an Abstract Syntax Tree (AST) and flatten it into a type-only sequence.
- **Result:** `let studentMarks = 90;` and `let a = 90;` both become `lexical_declaration:VAR:ASSIGN:NUM`. The logic remains identical regardless of naming.

## 2. The "Code Injection" Loophole
**The Problem:** Adding "noise" (meaningless comments, `console.log`, or dead variables) in the middle of stolen code often breaks the "fingerprint chain" of standard checkers.
**GitPulse Correction:** 
- **Positional Winnowing:** We use a sliding window algorithm that selects the *minimum* hash value within a specific range.
- **Result:** If noise is injected, the algorithm "slides over" it and continues to pick the same structural hashes from the surrounding logic. It is mathematically resistant to local insertions.

## 3. The "Boilerplate Noise" Loophole
**The Problem:** Standard checkers often flag common library imports, React templates, or "Hello World" boilerplate as plagiarism, leading to "False Positive Fatigue" for professors.
**GitPulse Correction:** 
- **Whitelisted Hashes:** We maintain a global database of common framework patterns and library boilerplate.
- **Result:** These hashes are filtered out *before* comparison, ensuring that only "student-written" logic is evaluated.

## 4. The "Large Source" Loophole
**The Problem:** Jaccard Similarity (the standard metric) calculates the intersection over union. If a student steals a small 10-line function from a 10,000-line library, the similarity score is 0.1%, which checkers ignore.
**GitPulse Correction:** 
- **Containment Scoring:** We calculate what percentage of the *student's* code exists within the *source*.
- **Result:** In the example above, if those 10 lines represent 100% of the student's submission, the score is **100%**, even if it only represents 0.1% of the source.

## 5. The "Unseen Repo" Loophole
**The Problem:** Checkers only know what is in their database. If a student steals from a niche YouTube tutorial or a brand new GitHub repo, the checker misses it.
**GitPulse Correction:** 
- **Global Search Fallback:** If a local match isn't found, GitPulse triggers a real-time GitHub API "hunt" for similar structural patterns.
- **Quarantine Queue:** New discoveries are placed in a "Human-in-the-loop" review queue to be verified and ingested, making the system smarter with every scan.

---

### Comparison Summary

| Feature | Standard Checkers | GitPulse Forensic Engine |
| :--- | :--- | :--- |
| **Variable Renaming** | ❌ Fails | ✅ Neutralized (AST) |
| **Logic Reordering** | ❌ Fails | ✅ Neutralized (Winnowing) |
| **Code Injection** | ❌ Fails | ✅ Resistant (Sliding Window) |
| **Framework Noise** | ⚠️ High False Positives | ✅ Whitelisted Filtering |
| **Similarity Metric** | Jaccard (Symmetric) | **Containment (Asymmetric)** |
| **Database Growth** | Static | **Self-Learning (Quarantine)** |
