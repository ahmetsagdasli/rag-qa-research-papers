// server/src/llm.js
// Seçilen kaynak chunk'larla beraber LLM'e prompt kurup yanıt üretir.

const OpenAI = require("openai");

const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

function buildSystemPrompt() {
  return [
    "You are a helpful research assistant. Use simple, clear language.",
    "Give concise, easy-to-understand answers in plain text.",
    "Use simple bullet points (-) instead of complex formatting.",
    "Avoid mathematical symbols, special characters, and complex notation.",
    "Write in conversational, accessible language that anyone can understand.",
    "Answer in the SAME language as the user's question.",
    "Do not make things up. If the answer is truly not in the documents, say it is not found.",
    "A section marked 'FRONT MATTER' contains THIS document's own title, authors and abstract —",
    "use it as the authoritative source for questions about the title, authors, or what the paper is about.",
    "Only for questions about THIS paper's OWN authors, use the FRONT MATTER (not the bibliography,",
    "which lists other cited works). For questions ABOUT the references/bibliography themselves,",
    "you SHOULD use and summarize the reference entries provided.",
    "End with a simple 'Sources:' section listing the source files.",
    "Keep answers under 200 words and focus on the main points only.",
  ].join(" ");
}

function buildUserPrompt(question, contexts) {
  const sourcesBlock = contexts
    .map((c, i) => {
      const label = c.isHead
        ? `# Source ${i + 1} — FRONT MATTER (title / authors / abstract) [${c.source}]`
        : `# Source ${i + 1} [${c.source} :: chunk ${c.chunkIndex}]`;
      return `${label}\n${c.text}`;
    })
    .join("\n\n");

  return [
    `Question: ${question}`,
    "\nInstructions:",
    "- Answer in the same language as the question",
    "- Give a simple, clear answer using only the information below",
    "- Use plain language without special symbols or complex formatting",
    "- If the answer isn't in the documents, say so (in the question's language)",
    "- End with 'Sources:' and list the file names",
    "\nSource Information:",
    sourcesBlock,
  ].join("\n");
}

/**
 * Generates LLM response
 * @param {string} question
 * @param {Array<{text, source, chunkIndex}>} contexts
 * @returns {Promise<string>}
 */
async function answer(question, contexts) {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(question, contexts);

  const resp = await openai.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0.3,
    max_tokens: 300,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return resp.choices?.[0]?.message?.content || "";
}

module.exports = {
  answer,
};
