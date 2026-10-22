const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15000 });
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const MODES = ["none", "rewrite", "multi_query", "decompose"];

function parseQueryList(content, limit) {
  try {
    const parsed = JSON.parse(content.match(/\[[\s\S]*\]/)?.[0] || "[]");
    return [...new Set(parsed.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, limit);
  } catch { return []; }
}
async function generate(prompt, limit) {
  const response = await client.chat.completions.create({ model: MODEL, temperature: 0, max_tokens: 220, messages: [{ role: "system", content: "Return only a valid JSON array of strings. Do not answer the question." }, { role: "user", content: prompt }] });
  return parseQueryList(response.choices?.[0]?.message?.content || "", limit);
}
async function transform(question, mode = "none") {
  if (!MODES.includes(mode)) throw new Error("invalid query transformation mode");
  if (mode === "none") return { mode, queries: [question], subquestions: [] };
  try {
    if (mode === "rewrite") {
      const queries = await generate(`Rewrite this question for precise document retrieval without changing its intent: ${question}`, 1);
      return { mode, queries: queries.length ? queries : [question], subquestions: [] };
    }
    if (mode === "multi_query") {
      const generated = await generate(`Create exactly two distinct retrieval queries covering different wording/aspects of: ${question}`, 2);
      return { mode, queries: [question, ...generated.filter((query) => query !== question)].slice(0, 3), subquestions: [] };
    }
    const subquestions = await generate(`Break this complex question into at most three independent factual subquestions. Do not recursively decompose them: ${question}`, 3);
    return { mode, queries: subquestions.length ? subquestions : [question], subquestions: subquestions.length ? subquestions : [question] };
  } catch (error) {
    console.warn("query transformation fallback:", error.message);
    return { mode, queries: [question], subquestions: [] };
  }
}
module.exports = { MODES, parseQueryList, transform };
