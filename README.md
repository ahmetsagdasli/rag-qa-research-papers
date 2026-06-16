# RAG QA — Research Paper Assistant

A Retrieval-Augmented Generation (RAG) app for asking questions about your PDF research papers. Organize documents into folders, run scoped semantic search with two-stage retrieval + cross-encoder reranking, and get grounded answers with cited sources.

- **Backend:** Node.js / Express (CommonJS) + SQLite (`better-sqlite3`) + OpenAI embeddings + Cohere rerank
- **Frontend:** React 18 + Vite + Material UI (MUI v6)
- **Vector store:** local JSON index (`server/data/index.json`) with cosine similarity

---

## Features

- 📁 **Folders (collections)** — group papers; create / delete folders.
- 🔎 **Flexible search scope** — ask within a single document, multiple documents, a whole folder, or several folders at once.
- 🎯 **Two-stage retrieval** — top-N vector recall → **Cohere cross-encoder reranking** for sharper ordering (graceful fallback to plain cosine when disabled).
- 🌍 **Multilingual** — ask in any language (e.g. Turkish or English); answers come back in the question's language.
- 🧾 **Reliable metadata answers** — each document's front matter (title / authors / abstract) is always included, so "who are the authors / what is the title" works.
- 💾 **Persistence (SQLite)** — folders, documents and saved answers survive restarts.
- 🔖 **Save answers** — bookmark good answers into a folder.
- 📚 **Cited sources** — every answer shows the document, folder, relevance rank and a preview excerpt.
- 📑 **OpenAPI docs** — Swagger UI at `/docs`.

---

## Quick Start

### Prerequisites
- Node.js 18+ (tested on Node 24)
- An **OpenAI API key** (required — embeddings + answer generation)
- A **Cohere API key** (optional — enables reranking; without it the app falls back to cosine)

### 1) Backend
```bash
cd server
cp .env.example .env
# edit .env: set OPENAI_API_KEY (required) and COHERE_API_KEY (optional)
npm install
npm run dev
# → http://localhost:5050   |   docs: http://localhost:5050/docs
```

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```
The Vite dev server proxies `/api` and `/docs` to the backend on port 5050.

---

## Usage

1. Open `http://localhost:5173`.
2. Create a **folder** with the ➕ button in the sidebar.
3. **Drag & drop PDFs** into the folder (they're uploaded and indexed automatically).
4. *(optional)* Open **Search scope** above the question box to limit the search to specific documents or folders.
5. Ask a question — the answer appears with **cited sources** (folder, document, relevance rank).
6. Click **Save to folder** to bookmark an answer; saved answers appear in the **Saved answers** panel.

---

## Configuration (`server/.env`)

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | **Required.** Embeddings + answer generation. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model. |
| `LLM_MODEL` | `gpt-4o-mini` | OpenAI chat model for answers. |
| `COHERE_API_KEY` | — | Optional. Enables cross-encoder reranking. |
| `USE_RERANKER` | `true` | Toggle reranking on/off (A/B). Off ⇒ plain cosine. |
| `RERANK_MODEL` | `rerank-multilingual-v3.0` | Cohere rerank model (multilingual handles TR/EN). |
| `RETRIEVE_TOP_N` | `20` | Stage-1 candidate count (vector recall). |
| `FINAL_TOP_K` | `4` | Stage-2 count sent to the LLM after reranking. |
| `EMBED_BATCH_SIZE` | `64` | Chunks per embedding request during indexing. |
| `PORT` | `5050` | Backend port. |
| `CORS_ORIGIN` | `*` | Allowed CORS origin. |

> If `COHERE_API_KEY` is missing/placeholder or `USE_RERANKER=false`, retrieval gracefully falls back to single-stage cosine — no errors.

---

## How it works

1. **Ingest** — PDFs are parsed (`pdf-parse`), split into 800-char chunks (100 overlap), embedded in batches, and stored in `server/data/index.json`. Each chunk carries `collectionId` and `documentId` metadata.
2. **Stage 1 — recall** — the question is embedded; the top-N chunks are retrieved by cosine similarity, filtered by the requested scope.
3. **Stage 2 — rerank** — candidates are reordered by Cohere's cross-encoder; the top-K go to the LLM. Each document's front-matter chunk is also injected for reliable metadata answers.
4. **Answer** — the LLM answers in the question's language using only the provided context, and the UI shows cited sources with relevance ranks.

---

## API

Base URL: `http://localhost:5050` · Interactive docs: `/docs`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check. |
| `GET` | `/api/collections` | List folders (with document/answer counts). |
| `POST` | `/api/collections` | Create folder `{ name }`. |
| `DELETE` | `/api/collections/:id` | Delete folder (cascades documents & answers). |
| `GET` | `/api/collections/:id/documents` | List documents in a folder. |
| `POST` | `/api/collections/:id/documents` | Upload a PDF (multipart `file`). |
| `POST` | `/api/collections/:id/reindex` | (Re)build the vector index for a folder. |
| `GET` | `/api/documents` | List all documents (optional `?collectionId=`). |
| `GET` | `/api/progress` | Current indexing progress. |
| `POST` | `/api/ask` | Ask a question (see below). |
| `GET` | `/api/collections/:id/answers` | List saved answers for a folder. |
| `POST` | `/api/answers` | Save an answer to a folder. |

**`POST /api/ask`**
```jsonc
{
  "question": "Who are the authors of this paper?",
  "scope": { "collectionIds": [1], "documentIds": [5] },  // optional
  "collectionId": 1,   // fallback used when scope is omitted
  "topK": 4            // optional
}
```
Scope rules: only `documentIds` → those documents · only `collectionIds` → those folders · both → union (OR) · neither → `collectionId` (legacy). Response sources include `collectionName`, `documentId`, `score`, `scoreType` (`rerank` | `cosine` | `head`), and a `preview`.

---

## Project structure

```
server/
  src/
    server.js      # Express app, Swagger /docs, SQLite init
    routes.js      # all /api endpoints (collections, documents, ask, answers)
    db.js          # SQLite layer (collections, documents, answers)
    ingest.js      # PDF parse, chunk, batch-embed, write index.json
    retriever.js   # stage-1 vector recall + scope filter
    reranker.js    # stage-2 Cohere cross-encoder rerank (+ fallback)
    llm.js         # prompt construction + answer generation
    utils.js       # index load, cosine, top-k
  openapi.yaml     # API spec served at /docs
  data/            # PDFs (col_<id>/) + index.json   (gitignored)
data/app.db        # SQLite database                 (gitignored)
frontend/
  src/
    App.jsx                  # layout, sidebar, folder state
    api.js                   # API client
    theme.js                 # MUI design tokens
    components/
      UploadArea.jsx         # drag & drop PDF upload
      ScopeSelector.jsx      # folder/document scope picker
      ChatQA.jsx             # question box + answer
      SourceCard.jsx         # cited source card
      SavedAnswers.jsx       # saved answers panel
```

---

## Notes

- The vector store is a local JSON file (`server/data/index.json`) using cosine similarity — simple and dependency-free, suitable for moderate corpora.
- Chunking: 800 characters with 100-character overlap.
- `server/data/` (PDFs + index) and `data/app.db` (SQLite) are gitignored, as is `.env`. Never commit API keys.
