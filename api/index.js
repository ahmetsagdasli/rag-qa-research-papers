// Vercel Node.js Function entry point. Express handles the existing API,
// health check and OpenAPI routes without opening a second HTTP listener.
module.exports = require("../server/src/server");
