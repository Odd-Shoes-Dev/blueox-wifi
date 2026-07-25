const express = require("express");
const { sql } = require("../db");
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ success: false, error: "Unauthorized" });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

router.post("/login", (req, res) => {
  const { password } = req.body;
  if (password === (process.env.ADMIN_PASSWORD || "admin123")) {
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Wrong password" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get("/check", (req, res) => {
  res.json({ success: true, loggedIn: !!(req.session && req.session.admin) });
});

// ── Videos ───────────────────────────────────────────────────────────────────

router.get("/videos", requireAuth, async (req, res) => {
  try {
    const videos = await sql()`SELECT * FROM videos ORDER BY sort_order ASC, id ASC`;
    res.json({ success: true, data: videos });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/videos", requireAuth, async (req, res) => {
  try {
    const { title, youtube_url, watch_seconds } = req.body;
    if (!title || !youtube_url) return res.status(400).json({ success: false, error: "Title and URL required" });
    const [{ m }] = await sql()`SELECT MAX(sort_order) as m FROM videos`;
    const order = (m || 0) + 1;
    const rows = await sql()`
      INSERT INTO videos (title, youtube_url, watch_seconds, sort_order)
      VALUES (${title}, ${youtube_url}, ${watch_seconds || 30}, ${order})
      RETURNING *
    `;
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put("/videos/:id", requireAuth, async (req, res) => {
  try {
    const { title, youtube_url, watch_seconds, is_active } = req.body;
    await sql()`
      UPDATE videos SET title = ${title}, youtube_url = ${youtube_url},
        watch_seconds = ${watch_seconds}, is_active = ${is_active ? 1 : 0}
      WHERE id = ${req.params.id}
    `;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete("/videos/:id", requireAuth, async (req, res) => {
  try {
    await sql()`DELETE FROM videos WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Vouchers ─────────────────────────────────────────────────────────────────

router.get("/vouchers", requireAuth, async (req, res) => {
  try {
    const db = sql();
    const [{ c: total }] = await db`SELECT COUNT(*) as c FROM vouchers`;
    const [{ c: used }]  = await db`SELECT COUNT(*) as c FROM vouchers WHERE is_used = 1`;
    const [{ c: unused }] = await db`SELECT COUNT(*) as c FROM vouchers WHERE is_used = 0`;
    const recent = await db`SELECT * FROM vouchers ORDER BY created_at DESC LIMIT 50`;
    res.json({ success: true, data: { total: Number(total), used: Number(used), unused: Number(unused), recent } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/vouchers/generate", requireAuth, async (req, res) => {
  try {
    const { quantity, duration } = req.body;
    const qty = Math.min(parseInt(quantity) || 10, 500);
    const dur = duration || "1h";
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const db = sql();
    let added = 0, attempts = 0;
    while (added < qty && attempts < qty * 5) {
      attempts++;
      let code = "";
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      const result = await db`
        INSERT INTO vouchers (code, duration, mikrotik_status)
        VALUES (${code}, ${dur}, 'pending')
        ON CONFLICT (code) DO NOTHING
      `;
      if (result.count) added++;
    }
    res.json({ success: true, data: { added } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/vouchers/bulk", requireAuth, async (req, res) => {
  try {
    const { codes } = req.body;
    if (!codes || !Array.isArray(codes) || !codes.length)
      return res.status(400).json({ success: false, error: "No codes provided" });

    const db = sql();
    let added = 0;
    for (const raw of codes) {
      const code = raw.trim();
      if (!code) continue;
      const result = await db`INSERT INTO vouchers (code) VALUES (${code}) ON CONFLICT (code) DO NOTHING`;
      if (result.count) added++;
    }
    res.json({ success: true, data: { added } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete("/vouchers/used", requireAuth, async (req, res) => {
  try {
    const result = await sql()`DELETE FROM vouchers WHERE is_used = 1`;
    res.json({ success: true, data: { deleted: result.count } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Settings ─────────────────────────────────────────────────────────────────

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const rows = await sql()`SELECT key, value FROM settings`;
    const data = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    data.routerHost = process.env.MIKROTIK_IP || "192.168.88.1";
    data.routerPort = process.env.MIKROTIK_PORT || "8728";
    data.routerUser = process.env.MIKROTIK_USER || "admin";
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put("/settings", requireAuth, async (req, res) => {
  try {
    const db = sql();
    for (const [key, value] of Object.entries(req.body)) {
      await db`INSERT INTO settings (key, value) VALUES (${key}, ${String(value)})
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put("/settings/mikrotik", requireAuth, async (req, res) => {
  const { routerHost, routerPort, routerUser, routerPass } = req.body;
  if (routerHost) process.env.MIKROTIK_IP = routerHost;
  if (routerPort) process.env.MIKROTIK_PORT = String(routerPort);
  if (routerUser) process.env.MIKROTIK_USER = routerUser;
  if (routerPass) process.env.MIKROTIK_PASSWORD = routerPass;

  let connected = false;
  try {
    const { RouterOSAPI } = require("node-routeros");
    const conn = new RouterOSAPI({
      host: process.env.MIKROTIK_IP,
      port: parseInt(process.env.MIKROTIK_PORT || "8728"),
      user: process.env.MIKROTIK_USER,
      password: process.env.MIKROTIK_PASSWORD || "",
    });
    await conn.connect();
    conn.close();
    connected = true;
  } catch (_) {}

  res.json({ success: true, data: { connected } });
});

router.put("/settings/password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (currentPassword !== (process.env.ADMIN_PASSWORD || "admin123"))
    return res.status(401).json({ success: false, error: "Current password is incorrect" });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  process.env.ADMIN_PASSWORD = newPassword;
  req.session.destroy();
  res.json({ success: true });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const db = sql();
    const [{ c: totalVouchers }] = await db`SELECT COUNT(*) as c FROM vouchers`;
    const [{ c: unusedVouchers }] = await db`SELECT COUNT(*) as c FROM vouchers WHERE is_used = 0`;
    const [{ c: totalVideos }] = await db`SELECT COUNT(*) as c FROM videos WHERE is_active = 1`;
    const [{ c: usedToday }] = await db`
      SELECT COUNT(*) as c FROM vouchers
      WHERE is_used = 1 AND used_at > CURRENT_DATE
    `;
    res.json({ success: true, data: {
      totalVouchers: Number(totalVouchers),
      unusedVouchers: Number(unusedVouchers),
      usedVouchers: Number(totalVouchers) - Number(unusedVouchers),
      totalVideos: Number(totalVideos),
      usedToday: Number(usedToday),
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
