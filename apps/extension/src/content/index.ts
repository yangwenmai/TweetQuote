const BUTTON_ID = "tweetquote-next-entry";
const PANEL_ID = "tweetquote-next-panel";
const OVERLAY_ID = "tweetquote-next-overlay";
const PANEL_WIDTH = 520;

function isTweetDetailPage() {
  return /\/status\/\d+/.test(window.location.pathname);
}

function getPanelUrl() {
  const url = new URL(chrome.runtime.getURL("panel.html"));
  url.searchParams.set("tweetUrl", window.location.href);
  return url.toString();
}

function closePanel() {
  document.getElementById(PANEL_ID)?.remove();
  document.getElementById(OVERLAY_ID)?.remove();
}

function togglePanel() {
  if (document.getElementById(PANEL_ID)) {
    closePanel();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(34, 28, 24, 0.18)",
    zIndex: "999997",
  });
  overlay.addEventListener("click", closePanel);

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: `${PANEL_WIDTH}px`,
    maxWidth: "92vw",
    height: "100vh",
    background: "#fffdf9",
    borderLeft: "1px solid rgba(42, 33, 27, 0.12)",
    boxShadow: "-20px 0 48px rgba(34, 28, 24, 0.12)",
    zIndex: "999998",
  });

  const iframe = document.createElement("iframe");
  iframe.src = getPanelUrl();
  iframe.title = "TweetQuote Next";
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "0",
    background: "#fffdf9",
  });

  panel.appendChild(iframe);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

function ensureButton() {
  const existing = document.getElementById(BUTTON_ID);
  if (!isTweetDetailPage()) {
    existing?.remove();
    closePanel();
    return;
  }
  if (existing) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.textContent = "Open in TweetQuote";
  Object.assign(button.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    border: "0",
    borderRadius: "999px",
    background: "#221c18",
    color: "#fff",
    padding: "12px 18px",
    fontWeight: "700",
    cursor: "pointer",
    zIndex: "999999",
    boxShadow: "0 12px 32px rgba(34, 28, 24, 0.2)",
  });
  button.addEventListener("click", togglePanel);
  document.body.appendChild(button);
}

ensureButton();
setInterval(ensureButton, 1200);
