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
  }
});
