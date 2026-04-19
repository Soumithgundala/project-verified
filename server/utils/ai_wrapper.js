import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai"; // Updated to the new official SDK
import OpenAI from "openai";

// Initialize Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// The new SDK automatically picks up process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * SECURITY FENCE: Prompt Injection Defense
 * Strips all comments from code across JS, TS, Python, Java, and C.
 * Uses negative lookbehinds to protect URLs (http://).
 */
function stripComments(code) {
    if (!code) return "";
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '') // Removes JS/Java/C multi-line (/* ... */)
        .replace(/"""[\s\S]*?"""/g, '')   // Removes Python multi-line (""" ... """)
        .replace(/'''[\s\S]*?'''/g, '')   // Removes Python multi-line (''' ... ''')
        .replace(/(?<!:)\/\/.*/g, '')     // Removes JS/Java/C single-line (// ...) but protects http://
        .replace(/(?<!['"]\s*)#.*/g, '')  // Removes Python single-line (# ...)
        .trim();
}

async function generateSummary(prompt) {
    // 📝 Printing the exact text sent to the LLM
    console.log("\n====================================");
    console.log("📝 TEXT SENT TO LLM:");
    // console.log(prompt);
    console.log("====================================\n");

    // PRIMARY: Groq
    try {
        console.log("⚡ [AI Wrapper] Attempting analysis with Groq...");
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.1-8b-instant", // Updated to a currently supported model
            temperature: 0.2,
        });
        console.log("✅ [AI Wrapper] Groq analysis successful.");
        return chatCompletion.choices[0]?.message?.content;
    } catch (groqError) {
        console.warn(`⚠️ [AI Wrapper] Groq failed: ${groqError.message}`);
        console.log("🔄 Initiating Gemini Fallback...");
    }

    // SECONDARY: Gemini
    try {
        console.log("🔄 [AI Wrapper] Attempting analysis with Gemini...");
        // Updated to use the new @google/genai syntax
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                temperature: 0.2
            }
        });
        console.log("✅ [AI Wrapper] Gemini analysis successful.");
        return response.text;
    } catch (geminiError) {
        console.warn(`⚠️ [AI Wrapper] Gemini failed: ${geminiError.message}`);
        console.log("🔄 Initiating OpenAI Fallback...");
    }

    // TERTIARY: OpenAI
    try {
        console.log("🔄 [AI Wrapper] Attempting analysis with OpenAI...");
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o-mini",
            temperature: 0.2,
        });
        console.log("✅ [AI Wrapper] OpenAI analysis successful.");
        return completion.choices[0].message.content;
    } catch (openAiError) {
        console.error("❌ [AI Wrapper] CRITICAL: All AI endpoints failed!");
        throw new Error("AI processing unavailable across all providers.");
    }
}

async function analyzeRepositoryAST(repositoryName, astData) {

    const safeCode = stripComments(astData);
    const codeSnippet = safeCode.substring(0, 8000);
    const prompt = `You are an expert code analyzer. Analyze the following AST/code snippet from '${repositoryName}'. Extract the core logic fingerprint and provide a concise summary.\n\nCode/AST:\n${codeSnippet}`;
    // console.log(`🧠 Extracting Fingerprint and generating LLM Summary for ${repositoryName}...`);
    return await generateSummary(prompt);
}

async function normalizeTechClaims(textSlice) {
    const prompt = `You are a strict data normalizer. Read this text slice from an academic project report. Extract the core software, frameworks, databases, and APIs the student claims to have used.
You MUST normalize the names to their standard package-manager formats (e.g., change 'React.js' to 'react', 'PostgreSQL' to 'pg' or 'postgres', 'NodeJS' to 'node').
Return ONLY a flat JSON array of lowercase strings. Example: ['react', 'node', 'flask', 'leaflet']. No markdown, no introduction, and no extra text.

Text Slice:
${textSlice}`;

    const rawResponse = await generateSummary(prompt);
    try {
        // Strip out any markdown blocks if the LLM hallucinated them despite instructions
        const cleanJsonStr = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        const claimsArray = JSON.parse(cleanJsonStr);
        return Array.isArray(claimsArray) ? claimsArray : [];
    } catch (err) {
        console.error("❌ [AI Wrapper] Failed to parse claims as JSON:", rawResponse);
        return [];
    }
}

// Export using ES Modules (since you are using 'import' at the top)
export {
    generateSummary,
    analyzeRepositoryAST,
    normalizeTechClaims
};