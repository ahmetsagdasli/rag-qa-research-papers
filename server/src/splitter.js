// Simple character-based chunker with overlap
export function chunkText(text, chunkSize = 1200, overlap = 200) {
const chunks = [];
let start = 0;
while (start < text.length) {
const end = Math.min(start + chunkSize, text.length);
const slice = text.slice(start, end);
chunks.push({ content: slice, charStart: start, charEnd: end });
if (end === text.length) break;
start = end - overlap;
}
return chunks;
}