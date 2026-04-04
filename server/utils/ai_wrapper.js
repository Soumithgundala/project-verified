import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai"; // Updated to the new official SDK
import OpenAI from "openai";

// Initialize Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// The new SDK automatically picks up process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    const prompt = `You are an expert code analyzer. Analyze the following AST/code snippet from '${repositoryName}'. Extract the core logic fingerprint and provide a concise summary.\n\nCode/AST:\n${astData}`;
    // console.log(`🧠 Extracting Fingerprint and generating LLM Summary for ${repositoryName}...`);
    return await generateSummary(prompt);
}

// Export using ES Modules (since you are using 'import' at the top)
export {
    generateSummary,
    analyzeRepositoryAST
};