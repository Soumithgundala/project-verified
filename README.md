# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

<!-- Next To Do -->
The Plagiarism Matrix (Advanced Collusion Detection)

Private Repositories (GitHub OAuth)

Dynamic Readme Badges (Student-facing Proof of Work)

Option 1: The "Plagiarism Matrix" (Cross-Student AST Comparison)
Right now, your engine compares a student to their past self to ensure they didn't just paste a massive block of code. But what if they copied it from the student sitting next to them?

The Feature: Because you are already generating the mathematical Abstract Syntax Trees (ASTs) for every student in the cache, we can run the Zhang-Shasha algorithm between students.

The Pitch: Even if Student A changes all the variable names, adds comments, and moves functions around to trick standard plagiarism checkers, their mathematical AST structure will still match Student B. You can add a button to the Cohort Matrix that says "Check for Collusion" and it will flag pairs of students whose structural code is suspiciously identical.

Option 2: GitHub Classroom & Private Repo Support (OAuth)
Currently, your tool works perfectly on public repositories. However, 99% of university computer science courses use "GitHub Classroom," which generates Private repositories for every student to prevent cheating.

The Feature: We add a "Login with GitHub" button to the front page using GitHub OAuth.

The Pitch: When the professor logs in, your Node.js backend gets a secure Access Token. This allows your engine to seamlessly parse the private codebases of their students without making the students' code public. This is a mandatory requirement for FERPA/academic privacy compliance.

Option 3: The "Proof of Work" Dynamic Markdown Badge
Instead of just making this a tool for professors to catch cheaters, we can turn it into a tool for students to prove their authenticity to future employers.

The Feature: We create a new lightweight API route in your backend that returns an SVG image (like standard GitHub badges).

The Pitch: A student can paste a line of markdown into their README.md (e.g., ![Project-Verified](http://your-server.com/api/badge/owner/repo)). Every time they push code, the badge dynamically updates to show their current Integrity Score (e.g., "Project-Verified: 0.96 Authentic" in a green shield). It turns your platform into an industry standard for resume verification.