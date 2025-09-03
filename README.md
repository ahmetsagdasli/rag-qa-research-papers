# RAG QA App — Quick Start


## 1) Backend
cd server
cp .env.example .env
# Add OPENAI_API_KEY to .env (required)
npm i
npm run dev
# http://localhost:5050/docs — OpenAPI


## 2) Frontend
cd ../frontend
npm i
npm run dev
# http://localhost:5173


## Usage
1. Upload PDFs in the frontend (3-4 articles).
2. Type your question and click **Ask**.
3. Answer and cited source fragments are displayed.


## Notes
- Vector store is kept in `server/data/index.json` file.
- Chunking: 800 characters, 100 overlap.
- Similarity: cosine similarity, top-k=4 (configurable).
- Source attribution: `filename`, `chunkIndex`, `charStart/End`, and 300-character excerpt.