const BUTTON_ID = "tweetquote-extension-entry";
const PANEL_ID = "tweetquote-extension-panel";
const OVERLAY_ID = "tweetquote-extension-overlay";
const APP_BASE_URL = "http://159.89.204.255:8088/";
const PANEL_WIDTH = 520;

function isTweetDetailPage() {
  return /\/status\/\d+/.test(window.location.pathname);
}

function getAppUrl() {
  const url = new URL(APP_BASE_URL);
  url.searchParams.set("source", "extension");
  url.searchParams.set("embedded", "1");
  url.searchParams.set("tweet_url", window.location.href);
  return url.toString();
}

function getPanel() {
  return document.getElementById(PANEL_ID);
}

function getOverlay() {
  return document.getElementById(OVERLAY_ID);
}

function closePanel() {
  const panel = getPanel();
  const overlay = getOverlay();
  if (panel) panel.remove();
  if (overlay) overlay.remove();
  const button = document.getElementById(BUTTON_ID);
  if (button) button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:-3px;margin-right:6px;fill:#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-9.2 12H8.5V9.6L7 10.1V8.7l3.1-1.1h.7V14zm5.7-2.6c0 .9-.2 1.6-.6 2s-1 .7-1.7.7c-.7 0-1.3-.2-1.7-.7s-.6-1.1-.6-2V9.6c0-.9.2-1.6.6-2s1-.7 1.7-.7c.7 0 1.3.2 1.7.7s.6 1.1.6 2v1.8zm-1.3-2c0-.5-.1-.9-.2-1.1-.2-.2-.4-.4-.7-.4s-.5.1-.7.4c-.2.2-.2.6-.2 1.1v2.1c0 .5.1.9.2 1.1.2.2.4.4.7.4s.5-.1.7-.4c.2-.2.2-.6.2-1.1v-2.1z"/></svg>TQ`;
}

function togglePanel() {
  const existing = getPanel();
  if (existing) {
    closePanel();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(15,20,25,0.18)",
    zIndex: "999997"
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
    zIndex: "999998",
    background: "#fff",
    borderLeft: "1px solid rgba(15,20,25,0.12)",
    boxShadow: "-18px 0 48px rgba(15,20,25,0.18)",
    display: "flex",
    flexDirection: "column"
  });

  const iframe = document.createElement("iframe");
  iframe.src = getAppUrl();
  iframe.title = "Tweet Quote Panel";
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "none",
    background: "#f0f2f5",
    flex: "1"
  });

  panel.appendChild(iframe);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  const button = document.getElementById(BUTTON_ID);
  if (button) button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-2px;margin-right:4px;fill:#fff"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>关闭`;
}

function ensureButton() {
  const existing = document.getElementById(BUTTON_ID);
  if (!isTweetDetailPage()) {
    if (existing) existing.remove();
    closePanel();
    return;
  }

  if (existing) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:-3px;margin-right:6px;fill:#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-9.2 12H8.5V9.6L7 10.1V8.7l3.1-1.1h.7V14zm5.7-2.6c0 .9-.2 1.6-.6 2s-1 .7-1.7.7c-.7 0-1.3-.2-1.7-.7s-.6-1.1-.6-2V9.6c0-.9.2-1.6.6-2s1-.7 1.7-.7c.7 0 1.3.2 1.7.7s.6 1.1.6 2v1.8zm-1.3-2c0-.5-.1-.9-.2-1.1-.2-.2-.4-.4-.7-.4s-.5.1-.7.4c-.2.2-.2.6-.2 1.1v2.1c0 .5.1.9.2 1.1.2.2.4.4.7.4s.5-.1.7-.4c.2-.2.2-.6.2-1.1v-2.1z"/></svg>TQ`;
  Object.assign(button.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "999999",
    border: "none",
    borderRadius: "999px",
    padding: "12px 18px",
    background: "#1d9bf0",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    boxShadow: "0 12px 32px rgba(29,155,240,0.28)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center"
  });

  button.addEventListener("mouseenter", () => {
    button.style.background = "#187fcb";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "#1d9bf0";
  });
  button.addEventListener("click", togglePanel);

  document.body.appendChild(button);
}

function syncPanelUrl() {
  const panel = getPanel();
  if (!panel || !isTweetDetailPage()) return;
  const iframe = panel.querySelector("iframe");
  if (!iframe) return;
  const nextUrl = getAppUrl();
  if (iframe.src !== nextUrl) {
    iframe.src = nextUrl;
  }
}

ensureButton();
setInterval(() => {
  ensureButton();
  syncPanelUrl();
}, 1200);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePanel();
  }
});
