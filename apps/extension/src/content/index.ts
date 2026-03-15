const BUTTON_ID = "tweetquote-next-entry";
const PANEL_ID = "tweetquote-next-panel";
const OVERLAY_ID = "tweetquote-next-overlay";
const PANEL_WIDTH = 520;
const BUTTON_POSITION_KEY = "tweetquote-next-entry-position";
const DEFAULT_BUTTON_GAP = 20;

type ButtonPosition = {
  left: number;
  top: number;
};

function isTweetDetailPage() {
  return /\/status\/\d+/.test(window.location.pathname);
}

function getPanelUrl() {
  const url = new URL(chrome.runtime.getURL("panel.html"));
  url.searchParams.set("tweetUrl", window.location.href);
  return url.toString();
}

function getViewportBounds() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function clampButtonPosition(position: ButtonPosition, buttonWidth: number, buttonHeight: number): ButtonPosition {
  const viewport = getViewportBounds();
  return {
    left: Math.min(Math.max(12, position.left), Math.max(12, viewport.width - buttonWidth - 12)),
    top: Math.min(Math.max(12, position.top), Math.max(12, viewport.height - buttonHeight - 12)),
  };
}

function applyButtonPosition(button: HTMLButtonElement, position: ButtonPosition) {
  button.style.left = `${position.left}px`;
  button.style.top = `${position.top}px`;
  button.style.right = "auto";
  button.style.bottom = "auto";
}

function getDefaultButtonPosition(button: HTMLButtonElement): ButtonPosition {
  const viewport = getViewportBounds();
  return {
    left: viewport.width - button.offsetWidth - DEFAULT_BUTTON_GAP,
    top: viewport.height - button.offsetHeight - DEFAULT_BUTTON_GAP,
  };
}

async function saveButtonPosition(position: ButtonPosition) {
  await chrome.storage.local.set({
    [BUTTON_POSITION_KEY]: position,
  });
}

async function loadButtonPosition(): Promise<ButtonPosition | null> {
  const stored = await chrome.storage.local.get(BUTTON_POSITION_KEY);
  const value = stored[BUTTON_POSITION_KEY];
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ButtonPosition>;
  const left = typeof candidate.left === "number" ? candidate.left : null;
  const top = typeof candidate.top === "number" ? candidate.top : null;
  if (left === null || top === null) {
    return null;
  }
  return { left, top };
}

function setButtonVisibility(visible: boolean) {
  const button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (!button) return;
  button.style.opacity = visible ? "1" : "0";
  button.style.pointerEvents = visible ? "auto" : "none";
  button.style.transform = visible ? "translateY(0)" : "translateY(8px)";
}

function closePanel() {
  document.getElementById(PANEL_ID)?.remove();
  document.getElementById(OVERLAY_ID)?.remove();
  setButtonVisibility(true);
}

function openPanel() {
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(29, 155, 240, 0.12)",
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
    background: "#f5f8fa",
    borderLeft: "1px solid rgba(29, 155, 240, 0.2)",
    boxShadow: "-20px 0 48px rgba(29, 155, 240, 0.16)",
    zIndex: "999998",
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  Object.assign(closeButton.style, {
    position: "absolute",
    top: "12px",
    left: "-74px",
    padding: "10px 12px",
    borderRadius: "12px 0 0 12px",
    border: "1px solid rgba(29, 155, 240, 0.2)",
    borderRight: "0",
    background: "#ffffff",
    color: "#1d9bf0",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "-10px 8px 24px rgba(29, 155, 240, 0.12)",
  });
  closeButton.addEventListener("click", closePanel);

  const iframe = document.createElement("iframe");
  iframe.src = getPanelUrl();
  iframe.title = "TweetQuote Next";
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "0",
    background: "#f5f8fa",
  });

  panel.appendChild(closeButton);
  panel.appendChild(iframe);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  setButtonVisibility(false);
}

function togglePanel() {
  if (document.getElementById(PANEL_ID)) {
    closePanel();
    return;
  }
  openPanel();
}

async function hydrateButtonPosition(button: HTMLButtonElement) {
  const stored = await loadButtonPosition();
  const fallback = getDefaultButtonPosition(button);
  const nextPosition = clampButtonPosition(stored ?? fallback, button.offsetWidth, button.offsetHeight);
  applyButtonPosition(button, nextPosition);
}

function enableButtonDragging(button: HTMLButtonElement) {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let moved = false;

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const nextPosition = clampButtonPosition(
      {
        left: originLeft + (event.clientX - startX),
        top: originTop + (event.clientY - startY),
      },
      button.offsetWidth,
      button.offsetHeight,
    );
    if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) {
      moved = true;
    }
    applyButtonPosition(button, nextPosition);
  };

  const handlePointerUp = async (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    try {
      button.releasePointerCapture(event.pointerId);
    } catch {}
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
    button.style.cursor = "grab";
    if (moved) {
      await saveButtonPosition({
        left: button.offsetLeft,
        top: button.offsetTop,
      });
    }
    window.setTimeout(() => {
      moved = false;
    }, 0);
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    originLeft = button.offsetLeft;
    originTop = button.offsetTop;
    moved = false;
    button.style.cursor = "grabbing";
    button.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  });

  button.addEventListener("click", (event) => {
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    togglePanel();
  });
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
    border: "1px solid rgba(255, 255, 255, 0.24)",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #1d9bf0 0%, #1a8cd8 100%)",
    color: "#fff",
    padding: "12px 18px",
    fontWeight: "700",
    cursor: "grab",
    zIndex: "999999",
    boxShadow: "0 12px 32px rgba(29, 155, 240, 0.32)",
    touchAction: "none",
    userSelect: "none",
    transition: "opacity 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease",
  });
  document.body.appendChild(button);
  void hydrateButtonPosition(button);
  enableButtonDragging(button);
}

window.addEventListener("resize", () => {
  const button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (!button) return;
  const nextPosition = clampButtonPosition(
    {
      left: button.offsetLeft,
      top: button.offsetTop,
    },
    button.offsetWidth,
    button.offsetHeight,
  );
  applyButtonPosition(button, nextPosition);
});

ensureButton();
setInterval(ensureButton, 1200);
