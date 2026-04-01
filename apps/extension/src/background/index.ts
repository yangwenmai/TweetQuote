chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "tweetquote.ping") {
    sendResponse({ ok: true, source: "background" });
    return;
  }

  if (message?.type === "tweetquote.capture-context") {
    sendResponse({
      ok: true,
      capturedAt: new Date().toISOString(),
    });
    return;
  }

  if (message?.type === "tweetquote.image-proxy") {
    const { url } = message;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ error: `HTTP ${res.status}` });
          return;
        }
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        sendResponse({ dataUrl: `data:${contentType};base64,${btoa(binary)}` });
      })
      .catch((err) => {
        sendResponse({ error: String(err) });
      });
    return true;
  }

  if (message?.type === "tweetquote.api-proxy") {
    const { url, init } = message;
    fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body,
    })
      .then(async (response) => {
        const body = await response.text();
        sendResponse({ ok: response.ok, status: response.status, body });
      })
      .catch((error) => {
        sendResponse({ ok: false, status: 0, body: "", error: String(error) });
      });
    return true;
  }
});
