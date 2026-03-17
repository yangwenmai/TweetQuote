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
