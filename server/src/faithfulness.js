const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15000 });
async function judgeFaithfulness({ answer, contexts }) {
  const response = await client.chat.completions.create({ model: process.env.LLM_MODEL || "gpt-4o-mini", temperature: 0, max_tokens: 120, messages: [{ role:"system", content:"Judge whether the answer is supported only by the supplied evidence. Return only JSON: {\"supported\":true|false,\"reason\":\"short reason\"}. This is a model judgment, not ground truth." }, { role:"user", content:`Answer:\n${answer}\n\nEvidence:\n${contexts.join("\n---\n")}` }] });
  try { const value=JSON.parse(response.choices?.[0]?.message?.content || "{}"); return { label:"model_judgment", supported:value.supported === true, reason:typeof value.reason === "string" ? value.reason : "No reason returned" }; } catch { return { label:"model_judgment", supported:null, reason:"Evaluator returned invalid JSON" }; }
}
module.exports={ judgeFaithfulness };
