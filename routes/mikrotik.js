const express = require("express");
const { RouterOSAPI } = require("node-routeros");
const router = express.Router();

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
