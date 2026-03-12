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
import time
import urllib.error
import urllib.parse
import urllib.request

PORT = 8088
DIR = os.path.dirname(os.path.abspath(__file__))

MAX_ANNOTATIONS = 5
MIN_TERM_LENGTH = 2
MAX_SINGLE_TEXT_CHARS = 4000
MAX_BATCH_ITEM_CHARS = 2400
MAX_BATCH_ITEMS = 4
MAX_BATCH_TOTAL_CHARS = 6000
AI_TIMEOUT_SECONDS = 60
GOOGLE_TIMEOUT_SECONDS = 15
MAX_RETRIES = 2


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


class UpstreamAPIError(Exception):
    def __init__(self, status_code, message, detail="", retryable=False):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.detail = detail
        self.retryable = retryable


_env = load_env_file(os.path.join(DIR, ".env.local"))
AI_PROVIDER = _env.get("LLM_PROVIDER", "")
AI_API_KEY = _env.get("OPENAI_API_KEY", "")
AI_BASE_URL = _env.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
AI_MODEL = _env.get("OPENAI_MODEL", "gpt-4o-mini")
TWITTERAPI_KEY = _env.get("TWITTERAPI_KEY", "")


def lang_name(target_lang):
    return "中文" if "zh" in (target_lang or "").lower() else "English"


def is_retryable_status(status_code):
    return status_code in (408, 409, 429, 500, 502, 503, 504)


def backoff_sleep(attempt):
    time.sleep(0.8 * (2 ** attempt))


def clean_text(text):
    return (text or "").strip()


def validate_text_length(text, limit, field_name="text"):
    if len(text) > limit:
        raise ValueError(f"{field_name} too long ({len(text)} chars, limit {limit})")


def normalize_annotation(item, translation):
    if not isinstance(item, dict):
        return None
    term = item.get("term")
    if not isinstance(term, str) or len(term) < MIN_TERM_LENGTH:
        return None
    if not translation or term not in translation:
        return None
    original = item.get("original")
    ann_type = item.get("type")
    explanation = item.get("explanation")
    return {
        "term": term,
        "original": original if isinstance(original, str) else "",
        "type": ann_type if isinstance(ann_type, str) else "reference",
        "explanation": explanation if isinstance(explanation, str) else "",
    }


def clamp_annotations(raw_annotations, translation):
    if not isinstance(raw_annotations, list) or not translation:
        return []
    results = []
    seen = set()
    for item in raw_annotations:
        ann = normalize_annotation(item, translation)
        if not ann:
            continue
        key = ann["term"].lower()
        if key in seen:
            continue
        seen.add(key)
        results.append(ann)
        if len(results) >= MAX_ANNOTATIONS:
            break
    return results


def build_translation_rules(target_lang):
    name = lang_name(target_lang)
    return (
        f"You are a professional translator for Twitter/X posts.\n\n"
        f"Translate into {name}. Keep the wording natural, faithful, and easy to read.\n"
        f"Prefer consistency for names, jargon, and recurring phrases across related posts.\n"
        f"Use the surrounding chain context only to improve accuracy and pronoun resolution.\n\n"
        f"Annotation rules (STRICT):\n"
        f"- Maximum {MAX_ANNOTATIONS} annotations total per item, and 0 annotations is allowed.\n"
        f"- ONLY annotate niche technical jargon, obscure acronyms, cultural references, "
        f"or subculture slang that a general reader would likely miss.\n"
        f"- NEVER annotate common tech words, well-known companies, everyday vocabulary, "
        f"or terms shorter than {MIN_TERM_LENGTH} characters.\n"
        f"- The term field must be the EXACT substring appearing in the translated text.\n"
        f"- explanation must be concise and written in {name}.\n"
    )


def build_ai_single_prompt(text, target_lang):
    rules = build_translation_rules(target_lang)
    return (
        f"{rules}\n"
        f"Source text:\n\"\"\"\n{text}\n\"\"\"\n\n"
        f"Respond ONLY in valid JSON:\n"
        f'{{"translation":"full translated text",'
        f'"annotations":[{{"term":"exact translated substring",'
        f'"original":"source term",'
        f'"type":"academic|slang|idiom|cultural|technical|reference",'
        f'"explanation":"concise explanation"}}]}}'
    )


def build_ai_batch_prompt(items, target_lang):
    rules = build_translation_rules(target_lang)
    item_lines = []
    for item in items:
        role = item.get("contextRole", "quote")
        item_lines.append(
            f'- id: "{item["id"]}"\n'
            f'  role: "{role}"\n'
            f'  text: """{item["text"]}"""'
        )
    joined_items = "\n".join(item_lines)
    return (
        f"{rules}\n"
        "These posts belong to the same quote/reply chain. Maintain terminology consistency "
        "when the same idea appears more than once, but keep each translation self-contained.\n\n"
        "Input items:\n"
        f"{joined_items}\n\n"
        "Respond ONLY in valid JSON with this exact shape:\n"
        '{"items":[{"id":"same as input","translation":"full translated text","annotations":'
        '[{"term":"exact translated substring","original":"source term","type":"academic|slang|idiom|cultural|technical|reference","explanation":"concise explanation"}]}]}'
    )


def call_openai_json(ai_base_url, ai_api_key, ai_model, messages):
    api_url = f"{ai_base_url.rstrip('/')}/chat/completions"
    api_body = json.dumps({
        "model": ai_model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    for attempt in range(MAX_RETRIES + 1):
        req = urllib.request.Request(
            api_url,
            data=api_body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ai_api_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=AI_TIMEOUT_SECONDS) as resp:
                raw = resp.read().decode("utf-8")
                data = json.loads(raw)
                content = data["choices"][0]["message"]["content"]
                return json.loads(content)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:500]
            retryable = is_retryable_status(e.code)
            if retryable and attempt < MAX_RETRIES:
                backoff_sleep(attempt)
                continue
            raise UpstreamAPIError(e.code, f"AI API returned {e.code}", detail, retryable)
        except urllib.error.URLError as e:
            retryable = True
            if attempt < MAX_RETRIES:
                backoff_sleep(attempt)
                continue
            raise UpstreamAPIError(502, "AI translation failed", str(e), retryable)
        except json.JSONDecodeError as e:
            raise UpstreamAPIError(502, f"Invalid JSON from AI: {str(e)}", retryable=False)
        except Exception as e:
            retryable = "timed out" in str(e).lower() or "timeout" in str(e).lower()
            if retryable and attempt < MAX_RETRIES:
                backoff_sleep(attempt)
                continue
            raise UpstreamAPIError(502, f"AI translation failed: {str(e)}", retryable=retryable)


def translate_with_google(text, src, tgt):
    validate_text_length(text, MAX_SINGLE_TEXT_CHARS)
    params = urllib.parse.urlencode({
        "client": "gtx",
        "sl": src,
        "tl": tgt,
        "dt": "t",
        "q": text,
    })
    url = f"https://translate.googleapis.com/translate_a/single?{params}"

    for attempt in range(MAX_RETRIES + 1):
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        })
        try:
            with urllib.request.urlopen(req, timeout=GOOGLE_TIMEOUT_SECONDS) as resp:
                raw = resp.read().decode("utf-8")
                data = json.loads(raw)
                translated = "".join(seg[0] for seg in data[0] if seg and seg[0])
                detected = data[2] if len(data) > 2 else src
                return {"translated": translated, "detectedLang": detected}
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:300]
            retryable = is_retryable_status(e.code)
            if retryable and attempt < MAX_RETRIES:
                backoff_sleep(attempt)
                continue
            raise UpstreamAPIError(e.code, f"Google Translate returned {e.code}", detail, retryable)
        except urllib.error.URLError as e:
            if attempt < MAX_RETRIES:
                backoff_sleep(attempt)
                continue
            raise UpstreamAPIError(502, f"Translation failed: {str(e)}", retryable=True)
        except Exception as e:
            retryable = "timed out" in str(e).lower() or "timeout" in str(e).lower()
            if retryable and attempt < MAX_RETRIES:
                backoff_sleep(attempt)
                continue
            raise UpstreamAPIError(502, f"Translation failed: {str(e)}", retryable=retryable)


def split_batches(items, max_items=MAX_BATCH_ITEMS, max_total_chars=MAX_BATCH_TOTAL_CHARS):
    batches = []
    current = []
    current_chars = 0
    for item in items:
        item_chars = len(item["text"])
        should_split = (
            current
            and (len(current) >= max_items or current_chars + item_chars > max_total_chars)
        )
        if should_split:
            batches.append(current)
            current = []
            current_chars = 0
        current.append(item)
        current_chars += item_chars
    if current:
        batches.append(current)
    return batches


def normalize_batch_request(payload):
    raw_items = payload.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("Missing items")

    items = []
    early_results = []
    for idx, raw_item in enumerate(raw_items):
        raw_item = raw_item if isinstance(raw_item, dict) else {}
        item_id = str(raw_item.get("id", idx))
        text = clean_text(raw_item.get("text", ""))
        role = raw_item.get("contextRole") or "quote"
        if not text:
            early_results.append({
                "id": item_id,
                "status": "error",
                "error": {"message": "Missing text", "retryable": False},
            })
            continue
        if len(text) > MAX_BATCH_ITEM_CHARS:
            early_results.append({
                "id": item_id,
                "status": "error",
                "error": {"message": f"text too long for batch ({len(text)} chars)", "retryable": False},
            })
            continue
        items.append({"id": item_id, "text": text, "contextRole": role})
    return items, early_results


def parse_ai_batch_response(raw_result, requested_items):
    raw_items = raw_result.get("items")
    if not isinstance(raw_items, list):
        raise UpstreamAPIError(502, "Invalid AI batch payload", retryable=False)

    by_id = {}
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        item_id = str(raw_item.get("id", ""))
        if item_id:
            by_id[item_id] = raw_item

    results = []
    for item in requested_items:
        raw_item = by_id.get(item["id"])
        if not raw_item:
            results.append({
                "id": item["id"],
                "status": "error",
                "error": {"message": "Missing item in AI batch response", "retryable": False},
            })
            continue
        translation = raw_item.get("translation", "")
        if not isinstance(translation, str) or not translation.strip():
            results.append({
                "id": item["id"],
                "status": "error",
                "error": {"message": "Missing translation in AI batch response", "retryable": False},
            })
            continue
        annotations = clamp_annotations(raw_item.get("annotations", []), translation)
        usage_hint = ""
        if raw_item.get("annotations") and not annotations:
            usage_hint = "annotations_filtered"
        results.append({
            "id": item["id"],
            "status": "success",
            "translation": translation,
            "annotations": annotations,
            "usageHint": usage_hint,
        })
    return results


def translate_with_ai(text, target_lang, ai_base_url, ai_api_key, ai_model):
    validate_text_length(text, MAX_SINGLE_TEXT_CHARS)
    prompt = build_ai_single_prompt(text, target_lang)
    messages = [
        {"role": "system", "content": "You are a helpful translation assistant. Always respond in valid JSON."},
        {"role": "user", "content": prompt},
    ]
    result = call_openai_json(ai_base_url, ai_api_key, ai_model, messages)
    translation = result.get("translation", "")
    if not isinstance(translation, str) or not translation.strip():
        raise UpstreamAPIError(502, "Missing translation in AI response", retryable=False)
    return {
        "translation": translation,
        "annotations": clamp_annotations(result.get("annotations", []), translation),
    }


def translate_batch_with_ai(items, target_lang, ai_base_url, ai_api_key, ai_model):
    results = []
    for batch in split_batches(items):
        prompt = build_ai_batch_prompt(batch, target_lang)
        messages = [
            {"role": "system", "content": "You are a helpful translation assistant. Always respond in valid JSON."},
            {"role": "user", "content": prompt},
        ]
        try:
            raw_result = call_openai_json(ai_base_url, ai_api_key, ai_model, messages)
            results.extend(parse_ai_batch_response(raw_result, batch))
        except UpstreamAPIError as e:
            for item in batch:
                results.append({
                    "id": item["id"],
                    "status": "error",
                    "error": {
                        "message": e.message,
                        "detail": e.detail,
                        "retryable": e.retryable,
                        "http_status": e.status_code,
                    },
                })
    return results


def translate_batch_with_google(items, src, tgt):
    results = []
    for item in items:
        try:
            translated = translate_with_google(item["text"], src, tgt)
            results.append({
                "id": item["id"],
                "status": "success",
                "translation": translated["translated"],
                "detectedLang": translated["detectedLang"],
                "usageHint": "batched_by_server",
            })
        except UpstreamAPIError as e:
            results.append({
                "id": item["id"],
                "status": "error",
                "error": {
                    "message": e.message,
                    "detail": e.detail,
                    "retryable": e.retryable,
                    "http_status": e.status_code,
                },
            })
    return results


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
        self.send_json(200, {"configured": bool(TWITTERAPI_KEY)})

    def get_ai_config(self):
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
        if self.path.startswith("/api/ai-translate-batch"):
            self.proxy_ai_translate_batch()
        elif self.path.startswith("/api/ai-translate"):
            self.proxy_ai_translate()
        elif self.path.startswith("/api/translate-batch"):
            self.proxy_translate_batch()
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

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            return json.loads(body) if body else {}
        except (json.JSONDecodeError, ValueError):
            raise ValueError("Invalid JSON body")

    def ai_config_from_payload(self, payload):
        ai_base_url = payload.get("ai_base_url", "") or AI_BASE_URL
        ai_api_key = payload.get("ai_api_key", "") or AI_API_KEY
        ai_model = payload.get("ai_model", "") or AI_MODEL
        if not ai_api_key:
            raise ValueError("Missing AI API key — configure .env.local or pass ai_api_key")
        return ai_base_url, ai_api_key, ai_model

    def proxy_ai_translate(self):
        try:
            payload = self.read_json_body()
            text = clean_text(payload.get("text", ""))
            target_lang = payload.get("to", "zh-CN")
            ai_base_url, ai_api_key, ai_model = self.ai_config_from_payload(payload)
            if not text:
                self.send_json(400, {"error": "Missing text"})
                return
            result = translate_with_ai(text, target_lang, ai_base_url, ai_api_key, ai_model)
            self.send_json(200, result)
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

    def proxy_ai_translate_batch(self):
        try:
            payload = self.read_json_body()
            target_lang = payload.get("to", "zh-CN")
            ai_base_url, ai_api_key, ai_model = self.ai_config_from_payload(payload)
            items, early_results = normalize_batch_request(payload)
            results = early_results + translate_batch_with_ai(items, target_lang, ai_base_url, ai_api_key, ai_model)
            self.send_json(200, {"items": results})
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

    def proxy_translate(self):
        try:
            payload = self.read_json_body()
            text = clean_text(payload.get("text", ""))
            src = payload.get("from", "auto")
            tgt = payload.get("to", "zh-CN")
            if not text:
                self.send_json(400, {"error": "Missing text parameter"})
                return
            result = translate_with_google(text, src, tgt)
            self.send_json(200, result)
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

    def proxy_translate_batch(self):
        try:
            payload = self.read_json_body()
            src = payload.get("from", "auto")
            tgt = payload.get("to", "zh-CN")
            items, early_results = normalize_batch_request(payload)
            results = early_results + translate_batch_with_google(items, src, tgt)
            self.send_json(200, {"items": results})
        except ValueError as e:
            self.send_json(400, {"error": str(e)})

    def proxy_twitter_api(self):
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
        msg = format % args
        if "/api/" in msg:
            print(f"  🔀 PROXY {msg}")
        else:
            print(f"  📄 {msg}")


def main():
    html_file = os.path.join(DIR, "index.html")
    if not os.path.exists(html_file):
        print("❌ 找不到 index.html")
        print("   请确保 server.py 和 index.html 在同一个目录下")
        sys.exit(1)

    server = http.server.HTTPServer(("", PORT), Handler)
    print()
    print("  🐦 Tweet Quote 服务已启动")
    print("  ──────────────────────────────────")
    print("  📎 打开浏览器访问:")
    print(f"     http://localhost:{PORT}/")
    print("  ──────────────────────────────────")
    if AI_API_KEY:
        host = urllib.parse.urlparse(AI_BASE_URL).hostname or AI_BASE_URL
        print(f"  🤖 AI 翻译: ✓ {AI_MODEL} via {host}")
    else:
        print("  🤖 AI 翻译: ✗ 未配置 (.env.local)")
    if TWITTERAPI_KEY:
        print("  🐦 推文抓取: ✓ 使用 .env.local TWITTERAPI_KEY")
    else:
        print("  🐦 推文抓取: 需在界面配置或 .env.local 添加 TWITTERAPI_KEY")
    print("  ──────────────────────────────────")
    print("  按 Ctrl+C 停止服务")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  👋 服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
