const express = require("express");
const { sql } = require("../db");
const router = express.Router();

router.get("/video", async (req, res) => {
  try {
    const db = sql();
    const videos = await db`SELECT * FROM videos WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`;
    if (!videos.length) return res.json({ success: false, error: "No videos available" });

    const [{ c: used }] = await db`SELECT COUNT(*) as c FROM vouchers WHERE is_used = 1`;
    const video = videos[Number(used) % videos.length];

    const setting = await db`SELECT value FROM settings WHERE key = 'watch_seconds'`;
    const watchSeconds = parseInt(setting[0]?.value ?? "30");

    res.json({ success: true, data: { ...video, watch_seconds: watchSeconds } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/voucher", async (req, res) => {
  try {
    const db = sql();
    const mac = (req.body.mac || "").toLowerCase().trim();

    if (mac) {
      const recent = await db`
        SELECT * FROM vouchers
        WHERE used_by_mac = ${mac}
          AND used_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      `;
      if (recent.length) {
        return res.json({ success: false, error: "You already received a voucher recently.", code: recent[0].code });
      }
    }

    const rows = await db`SELECT * FROM vouchers WHERE is_used = 0 ORDER BY id ASC LIMIT 1`;
    if (!rows.length) return res.json({ success: false, error: "No vouchers available. Please ask staff for assistance." });

    const voucher = rows[0];
    await db`
      UPDATE vouchers SET is_used = 1, used_at = NOW(), used_by_mac = ${mac || null}
      WHERE id = ${voucher.id}
    `;

    res.json({ success: true, data: { code: voucher.code } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const rows = await sql()`SELECT key, value FROM settings`;
    res.json({ success: true, data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
