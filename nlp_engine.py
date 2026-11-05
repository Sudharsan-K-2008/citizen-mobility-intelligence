import hashlib
import json
import os
import re
import string
from datetime import datetime, timedelta, time as dtime

import requests
from locations import find_location, locate_name

FMT = "%Y-%m-%d %H:%M:%S"
CATEGORIES = ["accident", "congestion", "waterlogging", "road_damage", "public_transport", "road_closure"]
PRIORITY = ["accident", "waterlogging", "road_closure", "road_damage", "public_transport", "congestion"]

_T = r"(?:bus|buses|mtc|metro|train|local train|suburban|mrts|shuttle|route)"
_D = r"(?:delay\w*|late|cancel\w*|not coming|not running|not available|breakdown|broke down|stranded|overcrowded|crowded|no service)"

CATEGORY_RULES = {
    "accident": (re.compile(r"\b(?:accident|collision|collided|crash(?:ed)?|overturned|rammed|pile-?up|ran over|vibathu)\b|விபத்து", re.I), 3),
    "waterlogging": (re.compile(r"\b(?:water ?logg(?:ing|ed)|flood(?:ed|ing)?|inundat\w*|knee[- ]deep|water stagnat\w*|stagnant water|submerged|thanni (?:nikkudhu|ninnu))\b|வெள்ளம்", re.I), 3),
    "road_damage": (re.compile(
        r"\b(?:potholes?|craters?|sinkhole|kuzhi|uneven road)\b"
        r"|\b(?:road|roads|street|flyover|bridge)\b[^.!?\n]{0,60}\b(?:damaged|broken|caved|cracked|bad condition)\b"
        r"|\b(?:damaged|broken|cracked)\s+(?:road|roads|street|flyover|bridge|surface)\b|குழி", re.I), 3),
    "road_closure": (re.compile(r"\b(?:road ?block(?:ed)?|blocked|closed|closure|barricad\w*|diversion|diverted|construction|roadwork|road work|metro work|digging|tree fell|fallen tree)\b", re.I), 2),
    "public_transport": (re.compile(rf"\b{_T}\b[^.!?\n]*\b{_D}\b|\b{_D}\b[^.!?\n]*\b{_T}\b", re.I), 2),
    "congestion": (re.compile(r"\b(?:traffic|jam|jammed|congest\w*|gridlock|stuck|crawl\w*|slow(?:ly)?[- ]moving|moving (?:very )?slowly|bumper to bumper|nerisal)\b|நெரிசல்", re.I), 1),
}

NORMAL_RX = re.compile(
    r"\b(?:moving|running|flowing|working)\s+(?:normally|smoothly|fine)\b|\bno\s+(?:traffic|jam|issues?|problems?)\b|\btraffic is (?:clear|light|normal)\b", re.I)

SUB_ISSUES = [
    ("road_damage", "Pothole", r"potholes?|kuzhi|குழி"),
    ("accident", "Overturned vehicle", r"overturn\w*|toppled"),
    ("accident", "Vehicle collision", r"collision|collided|crash\w*|rammed|pile-?up"),
    ("accident", "Injury / emergency", r"injur\w*|ambulance|ran over"),
    ("road_closure", "Fallen tree", r"tree fell|fallen tree"),
    ("road_closure", "Construction work", r"construction|roadwork|road work|metro work|digging"),
    ("road_closure", "Diversion / barricade", r"diversion|diverted|barricad\w*"),
    ("public_transport", "Bus delay", r"\bbus\w*|mtc"),
    ("public_transport", "Train / metro delay", r"train|metro|mrts|suburban"),
    ("waterlogging", "Waterlogged road", r"water ?logg\w*|flood\w*|water stagnat\w*|stagnant water|submerged"),
    ("congestion", "Heavy traffic", r"traffic|jam\w*|congest\w*|stuck"),
]

AFFECTED = [
    ("two-wheelers", r"two[- ]?wheelers?|bikes?|motorcycles?|scooters?"),
    ("buses", r"\bbuses\b|\bbus\b"),
    ("pedestrians", r"pedestrians?|walkers|school children|students"),
    ("ambulances", r"ambulance"),
    ("autos/cabs", r"\bautos?\b|cabs?|taxis?"),
    ("cars", r"\bcars?\b"),
    ("commuters", r"commuters|passengers|office[- ]?goers"),
]

BASE_SEVERITY = {"accident": 55, "waterlogging": 45, "road_closure": 40, "congestion": 30, "road_damage": 25, "public_transport": 20}

POS = {"excellent", "great", "good", "smooth", "smoothly", "thank", "thanks", "helpful", "happy", "love", "resolved",
       "improved", "appreciate", "appreciated", "wonderful", "nice", "quick", "quickly", "fixed", "cleared"}
NEG = {"frustrated", "frustrating", "angry", "worst", "terrible", "horrible", "pathetic", "unbearable", "useless",
       "suffering", "struggling", "dangerous", "danger", "ridiculous", "shameful", "disgusting", "waste", "awful",
       "mosam", "annoying", "annoyed", "irritating", "chaos", "nightmare", "unsafe", "helpless", "worse"}
NEG_PHRASES = ["fed up", "no response", "nobody cares", "not acceptable"]
NEGATORS = {"not", "no", "never", "isn't", "wasn't", "don't", "doesn't", "didn't", "cannot", "can't", "without"}

TANGLISH_RX = re.compile(r"\b(?:romba|illa|illai|irukku|panna|pannunga|vandhu|pochu|enna|inga|anga|mosam|theriyala|adhigam|vandi|nikkudhu|thanni|sema|kuzhi|vandhuchu)\b", re.I)
EMAIL_RX = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RX = re.compile(r"(?<!\d)(?:\+?91[- ]?)?[6-9]\d{9}(?!\d)")


def normalize(text):
    """Clean text + remove personal data (emails, phone numbers, @mentions, links)."""
    t = text or ""
    t = EMAIL_RX.sub("[email]", t)
    t = PHONE_RX.sub("[phone]", t)
    t = re.sub(r"https?://\S+|www\.\S+", " ", t)
    t = re.sub(r"@\w+", " ", t)
    t = t.replace("#", "")
    return re.sub(r"\s+", " ", t).strip()[:1000]


def text_hash(clean):
    squashed = "".join(ch for ch in clean.lower() if ch not in string.punctuation and not ch.isspace())
    return hashlib.sha1(squashed.encode("utf-8")).hexdigest()


def detect_language(t):
    if re.search(r"[\u0B80-\u0BFF]", t):
        return "Tamil"
    if TANGLISH_RX.search(t):
        return "Tanglish"
    return "English"


def classify(text):
    scores = {}
    for cat, (rx, weight) in CATEGORY_RULES.items():
        n = len(rx.findall(text))
        if n:
            scores[cat] = weight * min(n, 2)
    if not scores:
        return None, {}
    best = max(scores, key=lambda c: (scores[c], -PRIORITY.index(c)))
    return best, scores


def extract_time(text, now=None):
    now = now or datetime.now()
    t = text.lower()
    day = now.date()
    explicit_day = False
    if "yesterday" in t or "last night" in t:
        day -= timedelta(days=1)
        explicit_day = True
    hh = mm = None
    m = re.search(r"\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b", t)
    if m and 1 <= int(m.group(1)) <= 12:
        hh, mm = int(m.group(1)), int(m.group(2) or 0)
        if m.group(3) == "p" and hh < 12:
            hh += 12
        if m.group(3) == "a" and hh == 12:
            hh = 0
    else:
        m = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", t)
        if m:
            hh, mm = int(m.group(1)), int(m.group(2))
    if hh is None:
        for word, h in [("early morning", 6), ("morning", 8), ("afternoon", 14), ("evening", 18), ("night", 21), ("noon", 12)]:
            if re.search(rf"\b{word}\b", t):
                hh, mm = h, 0
                break
    if hh is None or mm is None or mm > 59:
        return now, "report time"
    dt = datetime.combine(day, dtime(hh, mm))
    if dt > now and not explicit_day:
        dt -= timedelta(days=1)
    return dt, "stated"


def extract_duration(text):
    t = text.lower()
    if re.search(r"half (?:an )?hour", t):
        return 30
    m = re.search(r"(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|hr)\b", t)
    if m:
        v = float(m.group(1))
        return int(v * 60) if m.group(2).startswith("h") else int(v)
    if re.search(r"\b(?:an|one) hour\b", t):
        return 60
    return None


def severity_label(score):
    return "Low" if score < 35 else "Medium" if score < 55 else "High" if score < 75 else "Critical"


def estimate_severity(category, text, duration):
    t = text.lower()
    score = BASE_SEVERITY[category]
    why = [f"Base for {category.replace('_', ' ')}: {score}"]

    def bump(rx, pts, reason):
        nonlocal score
        if re.search(rx, t):
            score += pts
            why.append(f"{reason} ({pts:+d})")

    bump(r"\b(?:block(?:ed|ing)?|stopped|standstill|no movement|completely|not moving|cannot pass|can't pass|impassable|closed)\b", 15, "Road blocked / traffic halted")
    bump(r"\b(?:injur\w*|ambulance|fatal|died|dead|death|critical|bleeding)\b", 25, "Injuries or emergency response mentioned")
    bump(r"\b(?:heavy|severe|massive|huge|major|badly|serious|chaos)\b", 8, "Described as heavy/major")
    bump(r"\b(?:\d+|several|many|multiple|two|three|four|five)\s+(?:vehicles|cars|buses|lorries|trucks|bikes|people)\b", 8, "Multiple vehicles/people affected")
    bump(r"\b(?:school|hospital|college)\b", 4, "Near a sensitive location")
    bump(r"\b(?:minor|slight|small)\b", -10, "Described as minor")
    if duration:
        if duration >= 60:
            score += 15; why.append("Lasting 1 hour or more (+15)")
        elif duration >= 30:
            score += 10; why.append("Lasting 30+ minutes (+10)")
        elif duration >= 15:
            score += 5; why.append("Lasting 15+ minutes (+5)")
    score = max(5, min(100, score))
    return score, severity_label(score), "; ".join(why)


def analyze_sentiment(text):
    low = text.lower()
    tokens = re.findall(r"[a-z']+", low)
    pos = neg = 0.0
    for i, w in enumerate(tokens):
        negated = i > 0 and tokens[i - 1] in NEGATORS
        if w in POS:
            neg += 1 if negated else 0
            pos += 0 if negated else 1
        elif w in NEG:
            pos += 1 if negated else 0
            neg += 0 if negated else 1
    neg += sum(1 for p in NEG_PHRASES if p in low)
    if re.search(r"(?:moving|running|working)\s+(?:normally|smoothly)", low):
        pos += 1
    total = pos + neg
    score = (pos - neg) / total if total else 0.0
    if score < 0 and text.count("!") >= 2:
        score = max(-1.0, score * 1.2)
    label = "Negative" if score < -0.2 else "Positive" if score > 0.2 else "Neutral"
    return label, round(score, 2)


def llm_extract(text):
    """Optional: fills gaps if ANTHROPIC_API_KEY is set. Falls back silently on any error."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": os.environ.get("CMI_LLM_MODEL", "claude-sonnet-5-5"),
                "max_tokens": 300,
                "system": ("You extract transport incident info from one citizen report in Chennai. Reply with ONLY JSON: "
                           '{"relevant": true|false, "category": "accident|congestion|waterlogging|road_damage|public_transport|road_closure"|null, '
                           '"location": "a place name explicitly mentioned"|null}. Never invent a location.'),
                "messages": [{"role": "user", "content": text}],
            },
            timeout=15,
        )
        out = r.json()["content"][0]["text"]
        return json.loads(out[out.index("{"): out.rindex("}") + 1])
    except Exception:
        return None


def analyze(text):
    clean = normalize(text)
    lang = detect_language(clean)
    sentiment, sent_score = analyze_sentiment(clean)
    cat, _ = classify(clean)
    normal = bool(NORMAL_RX.search(clean))
    relevant = cat is not None and not normal
    engine = "rules"
    loc = {"name": None, "lat": None, "lng": None, "confidence": 0.0, "method": "none"}
    if relevant or (cat is None and not normal):
        loc = find_location(clean) if relevant else loc

    if os.environ.get("ANTHROPIC_API_KEY") and not normal and (cat is None or (relevant and loc["lat"] is None)):
        llm = llm_extract(clean)
        if llm:
            engine = "rules+llm"
            if cat is None and llm.get("relevant") and llm.get("category") in CATEGORIES:
                cat, relevant = llm["category"], True
                loc = find_location(clean)
            if relevant and loc["lat"] is None and llm.get("location"):
                l2 = locate_name(str(llm["location"]))
                if l2["lat"] is not None or not loc["name"]:
                    loc = l2

    base = {
        "clean_text": clean, "text_hash": text_hash(clean), "language": lang,
        "sentiment": sentiment, "sentiment_score": sent_score, "engine": engine,
    }
    if not relevant:
        base.update({
            "relevant": False, "category": None, "sub_issue": None, "affected": None,
            "location_text": None, "lat": None, "lng": None, "geo_confidence": 0, "geo_method": "none",
            "incident_time": datetime.now().strftime(FMT), "time_basis": "report time", "duration_min": None,
            "severity_score": 0, "severity_label": "N/A", "severity_reason": "",
            "note": "This describes normal traffic conditions, not a problem." if normal
                    else "No transport problem was detected in this text.",
        })
        return base

    when, basis = extract_time(clean)
    duration = extract_duration(clean)
    sev, label, why = estimate_severity(cat, clean, duration)
    sub = next((s for c, s, rx in SUB_ISSUES if c == cat and re.search(rx, clean, re.I)), cat.replace("_", " ").title())
    affected = ", ".join(n for n, rx in AFFECTED if re.search(rx, clean, re.I)) or None
    base.update({
        "relevant": True, "category": cat, "sub_issue": sub, "affected": affected,
        "location_text": loc["name"], "lat": loc["lat"], "lng": loc["lng"],
        "geo_confidence": loc["confidence"], "geo_method": loc["method"],
        "incident_time": when.strftime(FMT), "time_basis": basis, "duration_min": duration,
        "severity_score": sev, "severity_label": label, "severity_reason": why, "note": "",
    })
    return base