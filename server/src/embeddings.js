import OpenAI from 'openai';


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';


export async function embedTexts(texts) {
// Batch for efficiency (OpenAI accepts multiple inputs)
const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
return res.data.map(d => d.embedding);
}


export async function embedText(text) {
const [vec] = await embedTexts([text]);
return vec;
}