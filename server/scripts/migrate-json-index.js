require("dotenv").config();
const { loadIndex } = require("../src/utils");
const { migrate, replaceCollection } = require("../src/vector-store");

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await migrate();
  const chunks = loadIndex().chunks || [];
  const invalid = chunks.filter((chunk) => !Array.isArray(chunk.vector) || chunk.vector.length !== 1536);
  if (invalid.length) throw new Error(`Migration rejected: ${invalid.length} chunks have incompatible embeddings`);
  const byCollection = new Map();
  for (const chunk of chunks) byCollection.set(chunk.collectionId, [...(byCollection.get(chunk.collectionId) || []), chunk]);
  for (const [collectionId, collectionChunks] of byCollection) await replaceCollection(collectionId, collectionChunks);
  console.log(`Migrated ${chunks.length} chunks from ${byCollection.size} collections.`);
})().catch((error) => { console.error(error.message); process.exit(1); });
