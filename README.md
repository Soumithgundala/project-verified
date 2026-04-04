# Project-Verified: Client Application

Welcome to the frontend application for **Project-Verified** (GitPulse MVP). This client is a modern, high-performance React dashboard designed to visually monitor, analyze, and report on the integrity and authenticity of code repositories.

## 🎯 Goal
The primary goal of the frontend is to democratize complex semantic code analysis. By transforming raw algorithmic scores, Abstract Syntax Tree distances, and LLM summaries into an easy-to-read, visual dashboard, it helps educators, code reviewers, and managers instantly recognize whether a codebase was written steadily by a human or generated through anomalous "high-velocity dumps" (e.g., via AI or copy-pasting).

## ⚙️ Process & Architecture
1. **User Input:** The dashboard takes a GitHub repository URL via the user interface.
2. **API Communication:** It communicates with the backend `server` to kick off the rigorous semantic parsing via the `/link-repo` endpoint.
3. **Data Visualization:** Once the rich semantic payload is returned, the client processes:
   - **Integrity Scores:** Shows if the repository is graded as "Authentic," "Standard," or "Suspect."
   - **Evolution Pulse:** Maps out a timeline of commits relative to their tree edit distance scores using dynamic area charts.
   - **Semantic Clusters:** Groups commits intelligently based on code injection speed.
   - **AI Intelligence & Fingerprinting:** Renders the generative AI response (LLM Summary) that explains the core mechanics of the code and flags global open-source plagiarism matches.
4. **Forensic Report Generation:** Acts as an immutable record generator by actively restructuring the DOM into a print-friendly format and exporting a standalone, high-fidelity PDF forensic report of the codebase.

## 🛠️ Tools & Technologies Used
- **[React 19](https://react.dev/):** The core declarative UI framework used for building the modular component architecture (e.g., `GitPulseMVP`, `ClassroomMatrix`).
- **[Vite](https://vitejs.dev/):** Used as the lightning-fast build tool and development server, ensuring hot module replacement (HMR) and optimized frontend assets.
- **[Recharts](https://recharts.org/):** A composable charting library built on React components utilized to render the beautiful, responsive "Evolution Pulse" graph.
- **[Lucide-React](https://lucide.dev/):** Supplies clean, modern SVG iconography throughout the application to enhance visual signaling (like the Shield, Activity line, and Terminal).
- **[html2pdf.js](https://ekoopmans.github.io/html2pdf.js/):** The engine driving the forensic PDF export. It captures the HTML snapshot, parses it to a canvas, and writes it directly to a downloadable PDF.

## 🚀 Getting Started

To run the frontend client locally:

```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

> **Note:** Make sure the backend algorithmic server is simultaneously running on port `5000` for the dashboard to receive project data!