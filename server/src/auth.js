// server/src/auth.js
// API_KEY env'i set edilmişse tüm /api istekleri X-API-Key header'ı ile eşleşmeli.
// Set edilmemişse (lokal/tek kullanıcı geliştirme varsayılanı) auth devre dışıdır.

const crypto = require("crypto");

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireApiKey() {
  return (req, res, next) => {
    const configured = process.env.API_KEY;
    if (!configured) return next();
    const provided = req.header("x-api-key") || "";
    if (provided && timingSafeEqual(provided, configured)) return next();
    return res.status(401).json({ ok: false, error: "Invalid or missing API key." });
  };
}

module.exports = { requireApiKey };
