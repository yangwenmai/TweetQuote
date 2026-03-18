#!/usr/bin/env python3
"""
Tweet Quote — 本地服务器
用法: python3 server.py
然后浏览器打开 http://localhost:8080
"""

import datetime
import http.server
import json
import os
import sys
import time
import uuid
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
MAX_CHAIN_DEPTH = 10
DAILY_TRIAL_RENDER_LIMIT = 3
WEEKLY_TRIAL_RENDER_LIMIT = 20
DAILY_TRIAL_WINDOW_SECONDS = 24 * 60 * 60
WEEKLY_TRIAL_WINDOW_SECONDS = 7 * 24 * 60 * 60
TRIAL_STORE_PATH = os.path.join(DIR, "data", "trial_sessions.json")
SUPPORT_CONTACT_URL = "https://x.com/maiyangai"


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


def ensure_parent_dir(filepath):
    parent = os.path.dirname(filepath)
    if parent:
        os.makedirs(parent, exist_ok=True)


def load_trial_store():
    if not os.path.exists(TRIAL_STORE_PATH):
        return {}
    try:
        with open(TRIAL_STORE_PATH, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_trial_store(store):
    ensure_parent_dir(TRIAL_STORE_PATH)
    with open(TRIAL_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)


def parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_legacy_usage_events(session, now, min_ts):
    legacy_used = max(0, parse_int(session.get("trial_used"), 0))
    if legacy_used <= 0:
        return []

    created_at = min(now, parse_int(session.get("created_at"), 0))
    last_seen_at = min(now, parse_int(session.get("last_seen_at"), 0))
    if last_seen_at <= 0:
        last_seen_at = created_at or now
    if created_at <= 0 or created_at > last_seen_at:
        created_at = last_seen_at
    if last_seen_at < min_ts:
        return []

    start_ts = max(min_ts, created_at)
    end_ts = max(start_ts, last_seen_at)
    if legacy_used == 1:
        return [end_ts]

    span = max(0, end_ts - start_ts)
    if span == 0:
        first_ts = max(min_ts, end_ts - legacy_used + 1)
        return list(range(first_ts, first_ts + legacy_used))

    step = span / float(legacy_used - 1)
    return [min(now, int(round(start_ts + (idx * step)))) for idx in range(legacy_used)]


def normalize_usage_events(session, now=None):
    now = int(now or time.time())
    min_ts = now - WEEKLY_TRIAL_WINDOW_SECONDS
    raw_events = session.get("usage_events")
    if not isinstance(raw_events, list):
        raw_events = build_legacy_usage_events(session, now, min_ts)
    elif not raw_events:
        raw_events = build_legacy_usage_events(session, now, min_ts)
    events = []
    for item in raw_events:
        try:
            ts = int(item)
        except (TypeError, ValueError):
            continue
        if ts >= min_ts:
            events.append(ts)
    events.sort()
    session["usage_events"] = events
    return events


def get_trial_usage_stats(session, now=None):
    now = int(now or time.time())
    events = normalize_usage_events(session, now)
    daily_cutoff = now - DAILY_TRIAL_WINDOW_SECONDS
    daily_events = [ts for ts in events if ts >= daily_cutoff]
    daily_used = len(daily_events)
    weekly_used = len(events)
    daily_remaining = max(0, DAILY_TRIAL_RENDER_LIMIT - daily_used)
    weekly_remaining = max(0, WEEKLY_TRIAL_RENDER_LIMIT - weekly_used)
    exhausted_reason = ""
    if daily_remaining <= 0:
        exhausted_reason = "daily"
    elif weekly_remaining <= 0:
        exhausted_reason = "weekly"
    return {
        "daily_used": daily_used,
        "daily_remaining": daily_remaining,
        "weekly_used": weekly_used,
        "weekly_remaining": weekly_remaining,
        "requires_upgrade": daily_remaining <= 0 or weekly_remaining <= 0,
        "exhausted_reason": exhausted_reason,
        "next_daily_reset_at": (daily_events[0] + DAILY_TRIAL_WINDOW_SECONDS) if daily_events else 0,
        "next_weekly_reset_at": (events[0] + WEEKLY_TRIAL_WINDOW_SECONDS) if events else 0,
    }


def get_or_create_trial_session(device_id=""):
    store = load_trial_store()
    now = int(time.time())
    device_id = clean_text(device_id) or f"tq_{uuid.uuid4().hex}"
    session = store.get(device_id)
    if not isinstance(session, dict):
        session = {
            "device_id": device_id,
            "usage_events": [],
            "created_at": now,
        }
    normalize_usage_events(session, now)
    session["last_seen_at"] = now
    session["trial_limit"] = WEEKLY_TRIAL_RENDER_LIMIT
    session["trial_used"] = len(session.get("usage_events") or [])
    store[device_id] = session
    save_trial_store(store)
    return device_id, session


def increment_trial_usage(device_id):
    store = load_trial_store()
    now = int(time.time())
    session = store.get(device_id) or {
        "device_id": device_id,
        "usage_events": [],
        "created_at": now,
    }
    events = normalize_usage_events(session, now)
    events.append(now)
    session["usage_events"] = events
    session["trial_limit"] = WEEKLY_TRIAL_RENDER_LIMIT
    session["trial_used"] = len(events)
    session["last_seen_at"] = now
    store[device_id] = session
    save_trial_store(store)
    return session


def session_payload(device_id, session):
    stats = get_trial_usage_stats(session)
    trial_remaining = min(stats["daily_remaining"], stats["weekly_remaining"])
    return {
        "device_id": device_id,
        "trial_total": WEEKLY_TRIAL_RENDER_LIMIT,
        "trial_used": stats["weekly_used"],
        "trial_remaining": trial_remaining,
        "daily_total": DAILY_TRIAL_RENDER_LIMIT,
        "daily_used": stats["daily_used"],
        "daily_remaining": stats["daily_remaining"],
        "weekly_total": WEEKLY_TRIAL_RENDER_LIMIT,
        "weekly_used": stats["weekly_used"],
        "weekly_remaining": stats["weekly_remaining"],
        "requires_upgrade": stats["requires_upgrade"],
        "exhausted_reason": stats["exhausted_reason"],
        "next_daily_reset_at": stats["next_daily_reset_at"],
        "next_weekly_reset_at": stats["next_weekly_reset_at"],
        "hosted_twitter_available": bool(TWITTERAPI_KEY),
        "hosted_ai_available": bool(AI_API_KEY),
        "extension_install_url": "/extension/",
        "web_editor_url": "/",
        "support_contact_url": SUPPORT_CONTACT_URL,
    }


def extract_tweet_id(value):
    value = clean_text(value)
    if not value:
        return ""
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme and parsed.netloc:
        parts = [part for part in parsed.path.split("/") if part]
        for idx, part in enumerate(parts):
            if part == "status" and idx + 1 < len(parts):
                candidate = parts[idx + 1]
                if candidate.isdigit():
                    return candidate
    return value if value.isdigit() else ""


def fetch_tweet_by_id(tweet_id, api_key):
    if not tweet_id:
        raise ValueError("Missing tweet_id")
    if not api_key:
        raise ValueError("Missing api_key — configure .env.local TWITTERAPI_KEY or pass api_key")

    target_url = f"https://api.twitterapi.io/twitter/tweets?tweet_ids={urllib.parse.quote(tweet_id)}"
    req = urllib.request.Request(target_url, headers={
        "X-API-Key": api_key,
        "User-Agent": "TweetQuote/1.0",
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            tweet = (data.get("tweets") or [None])[0]
            if not tweet:
                raise UpstreamAPIError(404, "Tweet not found", retryable=False)
            return tweet
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise UpstreamAPIError(e.code, f"TwitterAPI.io returned {e.code}", body[:300], is_retryable_status(e.code))
    except urllib.error.URLError as e:
        raise UpstreamAPIError(502, f"Twitter fetch failed: {str(e)}", retryable=True)
    except json.JSONDecodeError as e:
        raise UpstreamAPIError(502, f"Invalid JSON from Twitter API: {str(e)}", retryable=False)


def resolve_quote_chain(tweet_id, api_key, max_depth=MAX_CHAIN_DEPTH):
    root = fetch_tweet_by_id(tweet_id, api_key)
    chain = [dict(root, _rel="main")]
    visited = {str(tweet_id)}
    current = root
    depth = 1

    while depth < max_depth:
        next_id = ""
        is_reply = False
        quoted = current.get("quoted_tweet") if isinstance(current, dict) else None
        quoted_id = str((quoted or {}).get("id") or "")

        if quoted_id and quoted_id not in visited:
            next_id = quoted_id
        elif current.get("inReplyToId") and str(current.get("inReplyToId")) not in visited:
            next_id = str(current.get("inReplyToId"))
            is_reply = True

        if not next_id:
            break

        visited.add(next_id)

        if (not is_reply and quoted_id == next_id and quoted and quoted.get("text") and quoted.get("author")):
            next_tweet = dict(quoted, _rel="quote")
        else:
            fetched = fetch_tweet_by_id(next_id, api_key)
            next_tweet = dict(fetched, _rel=("reply" if is_reply else "quote"))

        chain.append(next_tweet)
        current = next_tweet
        depth += 1

    return chain


def translate_chain_items(raw_items, target_lang, provider, ai_base_url="", ai_api_key="", ai_model="", include_annotations=True):
    provider = clean_text(provider or "none").lower()
    target_lang = clean_text(target_lang or "zh-CN") or "zh-CN"
    prepared = [
        {"id": str(idx), "text": clean_text(item.get("text", "")), "contextRole": item.get("_rel", "quote")}
        for idx, item in enumerate(raw_items)
        if clean_text(item.get("text", ""))
    ]
    translated = {}

    if provider == "none" or not prepared:
        return translated
    if provider == "google":
        results = translate_batch_with_google(prepared, "auto", target_lang)
    elif provider == "ai":
        results = translate_batch_with_ai(prepared, target_lang, ai_base_url, ai_api_key, ai_model)
    else:
        raise ValueError("Unsupported translation_provider")

    for result in results:
        item_id = str(result.get("id", ""))
        if result.get("status") != "success":
            continue
        translated[item_id] = {
            "translation": result.get("translation") or result.get("translated") or "",
            "annotations": result.get("annotations", []) if include_annotations else [],
        }
    return translated


def build_v1_quota(session):
    stats = get_trial_usage_stats(session)
    return {
        "anonymousAllowed": True,
        "tier": "anonymous",
        "dailyTotal": DAILY_TRIAL_RENDER_LIMIT,
        "dailyRemaining": stats["daily_remaining"],
        "weeklyTotal": WEEKLY_TRIAL_RENDER_LIMIT,
        "weeklyRemaining": stats["weekly_remaining"],
        "requiresUpgrade": stats["requires_upgrade"],
        "hostedTwitterAvailable": bool(TWITTERAPI_KEY),
        "hostedAiAvailable": bool(AI_API_KEY),
    }


def build_v1_session_response(device_id, session):
    return {
        "deviceId": device_id,
        "sessionId": f"sess_{device_id}",
        "quota": build_v1_quota(session),
        "defaultRenderProvider": "ai" if AI_API_KEY else ("google" if TWITTERAPI_KEY else "none"),
    }


def build_v1_document(tweet_id, raw_items, translated_map, source, target_lang, translation_provider):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    nodes = []
    layers = []
    for idx, item in enumerate(raw_items):
        item_id = str(item.get("id", idx))
        translated = translated_map.get(str(idx), {})
        author = item.get("author") or {}
        relation = "root" if idx == 0 else (item.get("_rel") if item.get("_rel") in ("root", "quote", "reply") else "quote")
        author_name = str(author.get("name", ""))
        author_handle = str(author.get("userName", ""))
        translation_text = translated.get("translation", "")
        annotations = translated.get("annotations", [])
        nodes.append({
            "id": item_id,
            "relation": relation,
            "depth": idx,
            "sourceTweetId": item_id,
            "author": {
                "name": author_name,
                "handle": author_handle,
                "avatarUrl": str(author.get("profilePicture", "")),
                "isVerified": False,
            },
            "content": str(item.get("text", "")),
            "createdAt": str(item.get("createdAt", "")),
            "viewCount": item.get("viewCount") if isinstance(item.get("viewCount"), int) else None,
            "media": [],
            "translation": {
                "provider": translation_provider if translation_text else "none",
                "status": "success" if translation_text else "idle",
                "language": target_lang,
                "text": translation_text,
                "annotations": annotations if isinstance(annotations, list) else [],
                "error": "",
                "version": 0,
            },
        })
        layers.append({
            "index": idx,
            "relation": relation,
            "authorName": author_name,
            "authorHandle": author_handle,
            "tweetId": item_id,
        })
    title = nodes[0]["content"][:32] if nodes else "Untitled quote"
    document = {
        "id": str(uuid.uuid4()),
        "title": title,
        "status": "draft",
        "nodes": nodes,
        "renderSpec": {
            "language": target_lang,
            "translationProvider": translation_provider,
            "translationDisplay": "replace",
            "includeAnnotations": True,
            "exportScale": 2,
            "theme": "paper",
        },
        "fetchContext": {
            "source": source,
            "entryUrl": f"https://x.com/i/status/{tweet_id}",
            "tweetId": tweet_id,
            "pageLanguage": "en",
            "capturedAt": now,
        },
        "createdAt": now,
        "updatedAt": now,
    }
    return document, layers


def build_render_items(raw_items, translated_map):
    items = []
    for idx, item in enumerate(raw_items):
        translated = translated_map.get(str(idx), {})
        items.append({
            "id": str(item.get("id", idx)),
            "_rel": item.get("_rel", "quote"),
            "author": item.get("author") or {},
            "createdAt": item.get("createdAt") or "",
            "viewCount": item.get("viewCount"),
            "text": item.get("text") or "",
            "translatedContent": translated.get("translation", ""),
            "annotations": translated.get("annotations", []),
        })
    return items


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/v1/quota/"):
            self.v1_get_quota()
        elif self.path.startswith("/api/session"):
            self.get_session()
        elif self.path.startswith("/api/ai-config"):
            self.get_ai_config()
        elif self.path.startswith("/api/twitter-config"):
            self.get_twitter_config()
        elif self.path.startswith("/api/tweets"):
            self.proxy_twitter_api()
        else:
            super().do_GET()

    def get_session(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        device_id = params.get("device_id", [""])[0]
        device_id, session = get_or_create_trial_session(device_id)
        payload = session_payload(device_id, session)
        payload["default_render_provider"] = "ai" if AI_API_KEY else ("google" if TWITTERAPI_KEY else "none")
        self.send_json(200, payload)

    def get_twitter_config(self):
        self.send_json(200, {
            "configured": bool(TWITTERAPI_KEY),
            "hosted_mode_available": bool(TWITTERAPI_KEY),
            "trial_limit": WEEKLY_TRIAL_RENDER_LIMIT,
            "daily_limit": DAILY_TRIAL_RENDER_LIMIT,
            "weekly_limit": WEEKLY_TRIAL_RENDER_LIMIT,
        })

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
            "hosted_mode_available": configured,
        })

    def do_POST(self):
        if self.path.startswith("/api/v1/session/anonymous"):
            self.v1_create_session()
        elif self.path.startswith("/api/v1/quote/fetch"):
            self.v1_quote_fetch()
        elif self.path.startswith("/api/v1/translation/batch"):
            self.v1_translate_batch()
        elif self.path.startswith("/api/v1/translation/translate"):
            self.v1_translate_text()
        elif self.path.startswith("/api/v1/document/save"):
            self.v1_save_document()
        elif self.path.startswith("/api/quote-chain/render"):
            self.render_quote_chain()
        elif self.path.startswith("/api/ai-translate-batch"):
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

    def render_quote_chain(self):
        try:
            payload = self.read_json_body()
            tweet_value = payload.get("tweet_url") or payload.get("tweet_id") or ""
            tweet_id = extract_tweet_id(tweet_value)
            if not tweet_id:
                self.send_json(400, {"error": "Missing or invalid tweet_url / tweet_id"})
                return

            translation_provider = clean_text(payload.get("translation_provider", "none")).lower() or "none"
            include_annotations = bool(payload.get("include_annotations", True))
            target_lang = clean_text(payload.get("target_lang") or payload.get("to") or "zh-CN") or "zh-CN"
            request_api_key = clean_text(payload.get("api_key", ""))
            request_ai_key = clean_text(payload.get("ai_api_key", ""))
            using_hosted_twitter = not request_api_key
            using_hosted_ai = translation_provider == "ai" and not request_ai_key
            hosted_render = using_hosted_twitter or using_hosted_ai

            device_id, session = get_or_create_trial_session(payload.get("device_id", ""))
            trial_info = session_payload(device_id, session)
            if hosted_render and trial_info["requires_upgrade"]:
                self.send_json(402, {
                    "error": "Free trial exhausted",
                    "session": trial_info,
                })
                return

            twitter_api_key = request_api_key or TWITTERAPI_KEY
            raw_items = resolve_quote_chain(tweet_id, twitter_api_key)

            translated_map = {}
            if translation_provider != "none":
                if translation_provider == "ai":
                    ai_base_url, ai_api_key, ai_model = self.ai_config_from_payload(payload)
                    translated_map = translate_chain_items(
                        raw_items,
                        target_lang,
                        translation_provider,
                        ai_base_url,
                        ai_api_key,
                        ai_model,
                        include_annotations,
                    )
                else:
                    translated_map = translate_chain_items(
                        raw_items,
                        target_lang,
                        translation_provider,
                        include_annotations=include_annotations,
                    )

            if hosted_render:
                session = increment_trial_usage(device_id)
                trial_info = session_payload(device_id, session)

            self.send_json(200, {
                "tweet_id": tweet_id,
                "items": build_render_items(raw_items, translated_map),
                "meta": {
                    "translation_provider": translation_provider,
                    "target_lang": target_lang,
                    "chain_length": len(raw_items),
                    "source": clean_text(payload.get("source", "web")) or "web",
                    "hosted_render": hosted_render,
                },
                "session": trial_info,
            })
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

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
        try:
            tweet = fetch_tweet_by_id(tweet_ids, api_key)
            self.send_json(200, {"tweets": [tweet]})
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

    def v1_create_session(self):
        try:
            payload = self.read_json_body()
            device_id = payload.get("deviceId", "")
            device_id, session = get_or_create_trial_session(device_id)
            self.send_json(200, build_v1_session_response(device_id, session))
        except ValueError as e:
            self.send_json(400, {"error": str(e)})

    def v1_get_quota(self):
        path_parts = self.path.split("/")
        device_id = urllib.parse.unquote(path_parts[-1]) if len(path_parts) > 4 else ""
        device_id, session = get_or_create_trial_session(device_id)
        self.send_json(200, build_v1_quota(session))

    def v1_quote_fetch(self):
        try:
            payload = self.read_json_body()
            tweet_value = payload.get("tweetUrl") or payload.get("tweetId") or ""
            tweet_id = extract_tweet_id(tweet_value)
            if not tweet_id:
                self.send_json(400, {"error": "Missing or invalid tweetUrl / tweetId"})
                return

            translation_provider = clean_text(payload.get("translationProvider", "none")).lower() or "none"
            include_annotations = bool(payload.get("includeAnnotations", False))
            target_lang = clean_text(payload.get("targetLanguage") or "zh-CN") or "zh-CN"
            request_api_key = clean_text(payload.get("apiKey", ""))
            request_ai_key = clean_text(payload.get("aiApiKey", ""))
            source = clean_text(payload.get("source", "web")) or "web"
            using_hosted_twitter = not request_api_key
            using_hosted_ai = translation_provider == "ai" and not request_ai_key
            hosted_render = using_hosted_twitter or using_hosted_ai

            device_id, session = get_or_create_trial_session(payload.get("deviceId", ""))
            quota = build_v1_quota(session)
            if hosted_render and quota["requiresUpgrade"]:
                self.send_json(402, {"error": "Free trial exhausted", "quota": quota})
                return

            twitter_api_key = request_api_key or TWITTERAPI_KEY
            raw_items = resolve_quote_chain(tweet_id, twitter_api_key)

            translated_map = {}
            if translation_provider != "none":
                ai_base_url = clean_text(payload.get("aiBaseUrl", "")) or AI_BASE_URL
                ai_api_key = request_ai_key or AI_API_KEY
                ai_model = clean_text(payload.get("aiModel", "")) or AI_MODEL
                translated_map = translate_chain_items(
                    raw_items, target_lang, translation_provider,
                    ai_base_url, ai_api_key, ai_model, include_annotations,
                )

            if hosted_render:
                session = increment_trial_usage(device_id)
                quota = build_v1_quota(session)

            document, layers = build_v1_document(
                tweet_id, raw_items, translated_map, source, target_lang, translation_provider,
            )
            self.send_json(200, {
                "document": document,
                "quota": quota,
                "meta": {
                    "chainLength": len(raw_items),
                    "layers": layers,
                    "source": source,
                    "translationProvider": translation_provider,
                    "targetLanguage": target_lang,
                },
            })
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

    def v1_translate_text(self):
        try:
            payload = self.read_json_body()
            text = clean_text(payload.get("text", ""))
            if not text:
                self.send_json(400, {"error": "Missing text"})
                return
            target_lang = payload.get("targetLanguage", "zh-CN")
            provider = payload.get("provider", "google")

            if provider == "ai":
                ai_base_url = clean_text(payload.get("aiBaseUrl", "")) or AI_BASE_URL
                ai_api_key = clean_text(payload.get("aiApiKey", "")) or AI_API_KEY
                ai_model = clean_text(payload.get("aiModel", "")) or AI_MODEL
                result = translate_with_ai(text, target_lang, ai_base_url, ai_api_key, ai_model)
                self.send_json(200, {
                    "artifact": {
                        "provider": "ai",
                        "status": "success",
                        "language": target_lang,
                        "text": result.get("translation", ""),
                        "annotations": result.get("annotations", []),
                        "error": "",
                        "version": 0,
                    },
                })
            else:
                result = translate_with_google(text, "auto", target_lang)
                self.send_json(200, {
                    "artifact": {
                        "provider": "google",
                        "status": "success",
                        "language": target_lang,
                        "text": result.get("translated", ""),
                        "annotations": [],
                        "error": "",
                        "version": 0,
                    },
                })
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

    def v1_translate_batch(self):
        try:
            payload = self.read_json_body()
            target_lang = payload.get("targetLanguage", "zh-CN")
            provider = payload.get("provider", "google")
            raw_items = payload.get("items", [])
            if not raw_items:
                self.send_json(400, {"error": "Missing items"})
                return
            prepared = [
                {"id": str(item.get("id", idx)), "text": clean_text(item.get("text", "")), "contextRole": item.get("contextRole", "quote")}
                for idx, item in enumerate(raw_items)
                if clean_text(item.get("text", ""))
            ]
            if provider == "ai":
                ai_base_url = clean_text(payload.get("aiBaseUrl", "")) or AI_BASE_URL
                ai_api_key = clean_text(payload.get("aiApiKey", "")) or AI_API_KEY
                ai_model = clean_text(payload.get("aiModel", "")) or AI_MODEL
                results = translate_batch_with_ai(prepared, target_lang, ai_base_url, ai_api_key, ai_model)
            else:
                results = translate_batch_with_google(prepared, "auto", target_lang)
            response_items = []
            for r in results:
                translation = r.get("translation") or r.get("translated") or ""
                response_items.append({
                    "id": str(r.get("id", "")),
                    "artifact": {
                        "provider": provider,
                        "status": "success" if r.get("status") == "success" else "error",
                        "language": target_lang,
                        "text": translation,
                        "annotations": r.get("annotations", []),
                        "error": r.get("error", ""),
                        "version": 0,
                    },
                })
            self.send_json(200, {"items": response_items})
        except ValueError as e:
            self.send_json(400, {"error": str(e)})
        except UpstreamAPIError as e:
            self.send_json(e.status_code, {"error": e.message, "detail": e.detail})

    def v1_save_document(self):
        try:
            payload = self.read_json_body()
            document = payload.get("document")
            if not document:
                self.send_json(400, {"error": "Missing document"})
                return
            now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            document["updatedAt"] = now
            self.send_json(200, document)
        except ValueError as e:
            self.send_json(400, {"error": str(e)})

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
