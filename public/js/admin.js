// Shared admin utilities

async function api(path, options = {}) {
  const res = await fetch("/api/admin" + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

async function routerApi(path, options = {}) {
  const res = await fetch("/api/router" + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

function showToast(msg, type = "success") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "toast";
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: "fixed", bottom: "24px", right: "24px", zIndex: "9999",
    padding: "12px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: "500",
    fontFamily: "var(--font-body)", color: "#fff",
    background: type === "success" ? "#059669" : type === "error" ? "#DC2626" : "#0044CC",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Auth guard — redirect to login if not authenticated
async function requireAuth() {
  try {
    const json = await api("/check");
    if (!json.loggedIn) {
      window.location.href = "/admin/login.html";
    }
  } catch {
    window.location.href = "/admin/login.html";
  }
}

// Mark active nav item
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("href") === path);
  });
}

// Logout
function setupLogout() {
  const btn = document.getElementById("logoutBtn");
  if (btn) {
    btn.addEventListener("click", async () => {
      await api("/logout", { method: "POST" });
      window.location.href = "/admin/login.html";
    });
  }
}
