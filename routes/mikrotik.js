const express = require("express");
const { RouterOSAPI } = require("node-routeros");
const { sql } = require("../db");
const router = express.Router();

function durationToUptime(d) {
  const map = { "30m": "00:30:00", "1h": "01:00:00", "2h": "02:00:00", "4h": "04:00:00", "8h": "08:00:00", "1d": "1d 00:00:00" };
  return map[d] || "01:00:00";
}

// MikroTik calls this to get a RouterOS script that creates pending voucher users
router.get("/sync-script", async (req, res) => {
  const secret = process.env.SYNC_SECRET || "blueox-sync";
  if (req.query.secret !== secret) return res.status(403).send("# Forbidden");
  try {
    const db = sql();
    const pending = await db`SELECT code, duration FROM vouchers WHERE mikrotik_status = 'pending' LIMIT 100`;
    if (!pending.length) return res.type("text/plain").send("# No pending vouchers");
    const lines = pending.map(v => {
      const uptime = durationToUptime(v.duration);
      const pw = v.code.toLowerCase();
      return `:do {/ip/hotspot/user add name="${v.code}" password="${pw}" limit-uptime=${uptime} profile=default} on-error={}`;
    });
    lines.push(`:do {/tool/fetch url="https://wifi.blueoxkampus.com/api/router/sync-done?secret=${secret}" keep-result=no} on-error={}`);
    res.type("text/plain").send(lines.join("\n"));
  } catch (err) {
    res.type("text/plain").send(`# Error: ${err.message}`);
  }
});

// MikroTik calls this after executing the sync script
router.get("/sync-done", async (req, res) => {
  const secret = process.env.SYNC_SECRET || "blueox-sync";
  if (req.query.secret !== secret) return res.status(403).json({ success: false });
  try {
    await sql()`UPDATE vouchers SET mikrotik_status = 'synced' WHERE mikrotik_status = 'pending'`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getConfig() {
  return {
    host: process.env.MIKROTIK_IP || "192.168.88.1",
    port: parseInt(process.env.MIKROTIK_PORT || "8728"),
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
  };
}

async function withRouter(cb) {
  const cfg = getConfig();
  const conn = new RouterOSAPI({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  await conn.connect();
  try {
    return await cb(conn, cfg);
  } finally {
    conn.close();
  }
}

function notReachable(res) {
  res.json({
    success: false,
    error: "Router not reachable from cloud. Router stats require the server to be on the same local network as the MikroTik.",
  });
}

router.get("/stats", async (req, res) => {
  try {
    const data = await withRouter(async (conn) => {
      const resource = await conn.write("/system/resource/print");
      const r = resource[0] || {};
      const totalMem = parseInt(r["total-memory"] || "0") / 1024 / 1024;
      const freeMem = parseInt(r["free-memory"] || "0") / 1024 / 1024;
      const active = await conn.write("/ip/hotspot/active/print");
      return {
        cpuLoad: parseInt(r["cpu-load"] || "0"),
        uptime: r.uptime || "unknown",
        boardName: r["board-name"] || "unknown",
        version: r.version || "unknown",
        architecture: r["architecture-name"] || r.architecture || "—",
        cpuCount: r["cpu-count"] || "—",
        totalMemoryMb: Math.round(totalMem),
        freeMemoryMb: Math.round(freeMem),
        usedMemoryMb: Math.round(totalMem - freeMem),
        freeDiskBytes: parseInt(r["free-hdd-space"] || "0"),
        totalDiskBytes: parseInt(r["total-hdd-space"] || "0"),
        connectedUsers: active.length,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    notReachable(res);
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await withRouter(async (conn) => {
      const active = await conn.write("/ip/hotspot/active/print");
      return active.map((s) => ({
        ".id": s[".id"],
        name: s.user,
        address: s.address,
        "mac-address": s["mac-address"],
        uptime: s.uptime,
        "bytes-in": parseInt(s["bytes-in"] || "0"),
        "bytes-out": parseInt(s["bytes-out"] || "0"),
      }));
    });
    res.json({ success: true, data: users });
  } catch (err) {
    notReachable(res);
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    await withRouter(async (conn) => {
      await conn.write("/ip/hotspot/active/remove", [`=.id=${req.params.id}`]);
    });
    res.json({ success: true });
  } catch (err) {
    notReachable(res);
  }
});

module.exports = router;
