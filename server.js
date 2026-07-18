require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const { init } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "blueox-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 },
}));

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/portal", require("./routes/portal"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/router", require("./routes/mikrotik"));

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin/index.html")));
app.get("/admin/*", (req, res) => {
  const page = req.path.replace("/admin/", "");
  res.sendFile(path.join(__dirname, `public/admin/${page}.html`), (err) => {
    if (err) res.sendFile(path.join(__dirname, "public/admin/index.html"));
  });
});

init().then(() => {
  app.listen(PORT, () => console.log(`Blue OX WiFi running on http://localhost:${PORT}`));
}).catch((err) => {
  console.error("Failed to initialise database:", err.message);
  process.exit(1);
});
