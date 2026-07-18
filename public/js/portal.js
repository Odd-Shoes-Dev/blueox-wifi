// Parse MikroTik query params
const params = new URLSearchParams(window.location.search);
const mac = params.get("mac") || "";
const linkLogin = params.get("link-login") || "";
const linkOrig = params.get("link-orig") || "http://google.com";

let watchSeconds = 30;
let timer = null;
let elapsed = 0;
let voucherCode = null;
let videoStarted = false;

async function init() {
  // Load settings
  try {
    const settingsRes = await fetch("/api/portal/settings");
    const settingsJson = await settingsRes.json();
    if (settingsJson.success) {
      const s = settingsJson.data;
      if (s.portal_title) document.getElementById("portalTitle").textContent = s.portal_title.toUpperCase();
      if (s.portal_subtitle) document.getElementById("portalSub").textContent = s.portal_subtitle;
    }
  } catch {}

  // Load video
  try {
    const res = await fetch("/api/portal/video");
    const json = await res.json();

    document.getElementById("loadingState").style.display = "none";

    if (!json.success || !json.data) {
      showError("No videos available at the moment. Please ask staff for assistance.");
      return;
    }

    const video = json.data;
    watchSeconds = parseInt(video.watch_seconds) || 30;

    const embedUrl = toEmbedUrl(video.youtube_url);
    if (!embedUrl) {
      showError("Video could not be loaded. Please ask staff for assistance.");
      return;
    }

    document.getElementById("ytPlayer").src = embedUrl;
    document.getElementById("videoSection").style.display = "block";
    updateProgressLabel();

    document.getElementById("playBtn").addEventListener("click", startVideo);
  } catch (err) {
    showError("Could not load. Please check your connection and refresh.");
  }
}

function toEmbedUrl(url) {
  try {
    const u = new URL(url);
    let videoId = null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.includes("/shorts/")) videoId = u.pathname.split("/shorts/")[1].split("?")[0];
      else videoId = u.searchParams.get("v");
    } else if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1).split("?")[0];
    }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1&rel=0&enablejsapi=1`;
  } catch { return null; }
}

function startVideo() {
  if (videoStarted) return;
  videoStarted = true;
  document.getElementById("videoOverlay").classList.add("hidden");
  startCountdown();
}

function startCountdown() {
  elapsed = 0;
  timer = setInterval(() => {
    elapsed++;
    const pct = Math.min((elapsed / watchSeconds) * 100, 100);
    document.getElementById("progressFill").style.width = pct + "%";
    updateProgressLabel();
    if (elapsed >= watchSeconds) {
      clearInterval(timer);
      claimVoucher();
    }
  }, 1000);
}

function updateProgressLabel() {
  const remaining = Math.max(watchSeconds - elapsed, 0);
  const label = document.getElementById("progressLabel");
  if (elapsed === 0) {
    label.textContent = "Press play to start — watch for " + watchSeconds + " seconds";
  } else if (remaining > 0) {
    label.textContent = "Keep watching — " + remaining + " second" + (remaining === 1 ? "" : "s") + " remaining";
  } else {
    label.textContent = "Getting your voucher...";
  }
}

async function claimVoucher() {
  updateProgressLabel();
  try {
    const res = await fetch("/api/portal/voucher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac }),
    });
    const json = await res.json();

    if (json.success && json.data?.code) {
      voucherCode = json.data.code;
      showVoucher(voucherCode);
    } else if (json.code) {
      // Already has a voucher
      voucherCode = json.code;
      showVoucher(voucherCode);
    } else {
      showError(json.error || "No vouchers available. Please ask staff.");
    }
  } catch {
    showError("Connection error. Please refresh and try again.");
  }
}

function showVoucher(code) {
  document.getElementById("progressArea").style.display = "none";
  document.getElementById("voucherCode").textContent = code;
  document.getElementById("voucherArea").classList.add("visible");

  document.getElementById("connectBtn").addEventListener("click", () => {
    connect(code);
  });
}

function connect(code) {
  const btn = document.getElementById("connectBtn");
  btn.textContent = "Connecting...";
  btn.disabled = true;

  // MikroTik login: POST to link-login or redirect with credentials
  if (linkLogin) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = linkLogin;
    const addField = (name, value) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    addField("username", code);
    addField("password", code);
    addField("dst", linkOrig);
    document.body.appendChild(form);
    form.submit();
  } else {
    // Fallback: show code for manual entry
    btn.textContent = "Enter this code on the login page";
    btn.disabled = false;
    showError("Auto-connect not available. Use the code above to log in manually.");
  }
}

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = msg;
  el.classList.add("visible");
  document.getElementById("loadingState").style.display = "none";
}

init();
