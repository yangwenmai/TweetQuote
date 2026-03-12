#!/usr/bin/env python3
"""
Tweet Quote — 本地服务器
用法: python3 server.py
然后浏览器打开 http://localhost:8080
"""

import http.server
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse

PORT = 8088
DIR = os.path.dirname(os.path.abspath(__file__))

def load_env_file(filepath):
    """Parse a .env / .env.local file into a dict."""
    env = {}
    if not os.path.exists(filepath):
        return env
    with open(filepath, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            env[key] = value
    return env

_env = load_env_file(os.path.join(DIR, ".env.local"))
AI_PROVIDER  = _env.get("LLM_PROVIDER", "")
AI_API_KEY   = _env.get("OPENAI_API_KEY", "")
AI_BASE_URL  = _env.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
AI_MODEL     = _env.get("OPENAI_MODEL", "gpt-4o-mini")
TWITTERAPI_KEY = _env.get("TWITTERAPI_KEY", "")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/ai-config"):
            self.get_ai_config()
        elif self.path.startswith("/api/twitter-config"):
            self.get_twitter_config()
        elif self.path.startswith("/api/tweets"):
            self.proxy_twitter_api()
        else:
            super().do_GET()

    def get_twitter_config(self):
        """Return server-side Twitter API configuration status (without exposing the key)."""
        self.send_json(200, {"configured": bool(TWITTERAPI_KEY)})

    def get_ai_config(self):
        """Return server-side AI configuration status (without exposing the key)."""
        configured = bool(AI_API_KEY)
        host = ""
        if configured:
            try:
                host = urllib.parse.urlparse(AI_BASE_URL).hostname or ""
            except Exception:
                host = AI_BASE_URL
        self.send_json(200, {
            "configured": configured,
            "provider": AI_PROVIDER if configured else "",
            "model": AI_MODEL if configured else "",
            "base_url_host": host,
        })

    def do_POST(self):
        if self.path.startswith("/api/ai-translate"):
            self.proxy_ai_translate()
        elif self.path.startswith("/api/translate"):
            self.proxy_translate()
        else:
            self.send_json(404, {"error": "Not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def proxy_ai_translate(self):
        """Proxy AI translation requests to an OpenAI-compatible API."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            payload = json.loads(body) if body else {}
        except (json.JSONDecodeError, ValueError):
            self.send_json(400, {"error": "Invalid JSON body"})
            return

        text = payload.get("text", "")
        target_lang = payload.get("to", "zh-CN")
        ai_base_url = payload.get("ai_base_url", "") or AI_BASE_URL
        ai_api_key = payload.get("ai_api_key", "") or AI_API_KEY
        ai_model = payload.get("ai_model", "") or AI_MODEL

        if not text.strip():
            self.send_json(400, {"error": "Missing text"})
            return
        if not ai_api_key:
            self.send_json(400, {"error": "Missing AI API key — configure .env.local or pass ai_api_key"})
            return

        lang_name = "中文" if "zh" in target_lang else "English"
        prompt = (
            f"You are a professional translator for Twitter/X posts.\n\n"
            f"Task:\n"
            f"1. Translate the following tweet into {lang_name}. Keep it natural and accurate.\n"
            f"2. Annotate ONLY terms that a general reader would NOT understand without help.\n\n"
            f"Annotation rules (STRICT):\n"
            f"- Maximum 5 annotations total, even for long tweets. Prefer 2-4.\n"
            f"- ONLY annotate: niche technical jargon, obscure acronyms, cultural references "
            f"that most readers outside the culture wouldn't know, slang/memes specific to a subculture.\n"
            f"- NEVER annotate: common tech words (IDE, API, app, AI, etc.), "
            f"well-known product/company names (Google, Twitter, GitHub, etc.), "
            f"common internet terms, everyday vocabulary, words shorter than 2 characters, "
            f"generic nouns/verbs, or anything a typical tech-savvy reader would already know.\n"
            f"- If the tweet is straightforward, return 0 annotations — that's perfectly fine.\n"
            f"- The 'term' field must be the EXACT substring in your translated text.\n"
            f"- Each annotation term must be at least 2 characters long.\n\n"
            f"Source text:\n\"\"\"\n{text}\n\"\"\"\n\n"
            f"Respond ONLY in valid JSON:\n"
            f'{{"translation":"the full translated text",'
            f'"annotations":[{{"term":"exact substring in translated text",'
            f'"original":"original term from source",'
            f'"type":"academic|slang|idiom|cultural|technical|reference",'
            f'"explanation":"concise explanation in {lang_name}"}}]}}'
        )

        messages = [
            {"role": "system", "content": "You are a helpful translation assistant. Always respond in valid JSON."},
            {"role": "user", "content": prompt},
        ]

        api_url = f"{ai_base_url.rstrip('/')}/chat/completions"
        api_body = json.dumps({
            "model": ai_model,
            "messages": messages,
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }).encode("utf-8")

        req = urllib.request.Request(api_url, data=api_body, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ai_api_key}",
        })

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8")
                data = json.loads(raw)
                content = data["choices"][0]["message"]["content"]
                result = json.loads(content)
                if "annotations" in result and isinstance(result["annotations"], list):
                    translation = result.get("translation", "")
                    result["annotations"] = [
                        a for a in result["annotations"]
                        if isinstance(a.get("term"), str) and len(a["term"]) >= 2
                        and translation and a["term"] in translation
                    ][:5]
                self.send_json(200, result)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:500]
            self.send_json(e.code, {"error": f"AI API returned {e.code}", "detail": detail})
        except json.JSONDecodeError as e:
            self.send_json(502, {"error": f"Invalid JSON from AI: {str(e)}"})
        except Exception as e:
            self.send_json(502, {"error": f"AI translation failed: {str(e)}"})

    def proxy_translate(self):
        """Proxy translation requests to Google Translate free endpoint."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            payload = json.loads(body) if body else {}
        except (json.JSONDecodeError, ValueError):
            self.send_json(400, {"error": "Invalid JSON body"})
            return

        text = payload.get("text", "")
        src = payload.get("from", "auto")
        tgt = payload.get("to", "zh-CN")

        if not text.strip():
            self.send_json(400, {"error": "Missing text parameter"})
            return

        params = urllib.parse.urlencode({
            "client": "gtx",
            "sl": src,
            "tl": tgt,
            "dt": "t",
            "q": text,
        })
        url = f"https://translate.googleapis.com/translate_a/single?{params}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        })

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8")
                data = json.loads(raw)
                translated = "".join(seg[0] for seg in data[0] if seg and seg[0])
                detected = data[2] if len(data) > 2 else src
                self.send_json(200, {
                    "translated": translated,
                    "detectedLang": detected,
                })
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:300]
            self.send_json(e.code, {"error": f"Google Translate returned {e.code}", "detail": detail})
        except Exception as e:
            self.send_json(502, {"error": f"Translation failed: {str(e)}"})

    def proxy_twitter_api(self):
        """Forward request to api.twitterapi.io and return result."""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        tweet_ids = params.get("tweet_ids", [""])[0]
        api_key = (params.get("api_key", [""])[0] or "").strip() or TWITTERAPI_KEY

        if not tweet_ids:
            self.send_json(400, {"error": "Missing tweet_ids parameter"})
            return
        if not api_key:
            self.send_json(400, {"error": "Missing api_key — configure .env.local TWITTERAPI_KEY or pass api_key"})
            return

        target_url = f"https://api.twitterapi.io/twitter/tweets?tweet_ids={urllib.parse.quote(tweet_ids)}"
        req = urllib.request.Request(target_url, headers={
            "X-API-Key": api_key,
            "User-Agent": "TweetNestingTool/1.0",
        })

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            self.send_json(e.code, {"error": f"TwitterAPI.io returned {e.code}", "detail": body[:300]})
        except Exception as e:
            self.send_json(502, {"error": str(e)})

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Colorize proxy requests
        msg = format % args
        if "/api/" in msg:
            print(f"  🔀 PROXY {msg}")
        else:
            print(f"  📄 {msg}")

def main():
    # Check that HTML file exists
    html_file = os.path.join(DIR, "index.html")
    if not os.path.exists(html_file):
        print(f"❌ 找不到 index.html")
        print(f"   请确保 server.py 和 index.html 在同一个目录下")
        sys.exit(1)

    server = http.server.HTTPServer(("", PORT), Handler)
    print()
    print(f"  🐦 Tweet Quote 服务已启动")
    print(f"  ──────────────────────────────────")
    print(f"  📎 打开浏览器访问:")
    print(f"     http://localhost:{PORT}/")
    print(f"  ──────────────────────────────────")
    if AI_API_KEY:
        host = urllib.parse.urlparse(AI_BASE_URL).hostname or AI_BASE_URL
        print(f"  🤖 AI 翻译: ✓ {AI_MODEL} via {host}")
    else:
        print(f"  🤖 AI 翻译: ✗ 未配置 (.env.local)")
    if TWITTERAPI_KEY:
        print(f"  🐦 推文抓取: ✓ 使用 .env.local TWITTERAPI_KEY")
    else:
        print(f"  🐦 推文抓取: 需在界面配置或 .env.local 添加 TWITTERAPI_KEY")
    print(f"  ──────────────────────────────────")
    print(f"  按 Ctrl+C 停止服务")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  👋 服务已停止")
        server.server_close()

if __name__ == "__main__":
    main()
