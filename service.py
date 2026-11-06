import math
import re
from datetime import datetime, timedelta

from database import db
from nlp_engine import analyze, FMT

TIME_WINDOW_H = 6       # reports within 6 hours can be the same incident
DISTANCE_KM = 1.5       # ...and within 1.5 km
TEXT_SIM = 0.5          # fallback when location is unknown
STOP = set("the a an is are was were in at on near of to and for by with due because from this that it there has have been very".split())


def haversine(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _tokens(text):
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 2}


def similarity(a, b):
    ta, tb = _tokens(a), _tokens(b)
    return len(ta & tb) / len(ta | tb) if ta and tb else 0.0


def find_match(conn, a):
    """Find an existing incident this report probably belongs to (same category + time + place/text)."""
    t = datetime.strptime(a["incident_time"], FMT)
    lo = (t - timedelta(hours=TIME_WINDOW_H)).strftime(FMT)
    hi = (t + timedelta(hours=TIME_WINDOW_H)).strftime(FMT)
    cands = conn.execute(
        "SELECT * FROM incidents WHERE category=? AND status IN ('unverified','verified') "
        "AND last_seen>=? AND first_seen<=?", (a["category"], lo, hi)).fetchall()
    best, best_score = None, 0.0
    for c in cands:
        score = 0.0
        if a["lat"] is not None and c["lat"] is not None:
            d = haversine(a["lat"], a["lng"], c["lat"], c["lng"])
            if d <= DISTANCE_KM:
                score = 1.0 - d / (DISTANCE_KM * 2)
        elif a["location_text"] and c["location_text"] and a["location_text"].lower() == c["location_text"].lower():
            score = 0.8
        elif a["lat"] is None or c["lat"] is None:
            texts = [r["text"] for r in conn.execute("SELECT text FROM reports WHERE incident_id=?", (c["id"],))]
            sim = max((similarity(a["clean_text"], x) for x in texts), default=0.0)
            if sim >= TEXT_SIM:
                score = sim
        if score > best_score:
            best, best_score = c["id"], score
    return best


def recompute_incident(conn, iid):
    """Recalculate counts, severity, confidence, location from the incident's reports."""
    inc = conn.execute("SELECT * FROM incidents WHERE id=?", (iid,)).fetchone()
    if not inc:
        return
    rows = conn.execute("SELECT * FROM reports WHERE incident_id=? ORDER BY incident_time, id", (iid,)).fetchall()
    if not rows:
        conn.execute("DELETE FROM incidents WHERE id=?", (iid,))
        return
    # Copied/identical posts do NOT count as independent confirmation
    independent = len({r["text_hash"] for r in rows})
    sev = min(100, max(r["severity_score"] for r in rows) + min(18, 6 * (independent - 1)))
    located = next((r for r in rows if r["lat"] is not None), None)
    named = next((r["location_text"] for r in rows if r["location_text"]), None)
    lat = located["lat"] if located else None
    lng = located["lng"] if located else None
    loc_text = located["location_text"] if located else named
    conf = min(0.9, 0.35 + 0.15 * (independent - 1)) - (0.1 if lat is None else 0.0)
    if inc["status"] == "verified":
        conf = 1.0
    elif inc["status"] == "rejected":
        conf = 0.0
    from nlp_engine import severity_label
    conn.execute(
        """UPDATE incidents SET location_text=?, lat=?, lng=?, severity_score=?, severity_label=?,
           report_count=?, independent_count=?, confidence=?, avg_sentiment=?, first_seen=?, last_seen=? WHERE id=?""",
        (loc_text, lat, lng, sev, severity_label(sev), independent, independent, round(max(conf, 0.0), 2),
         round(sum(r["sentiment_score"] or 0 for r in rows) / len(rows), 2),
         min(r["incident_time"] for r in rows), max(r["incident_time"] for r in rows), iid))


def submit_report(text, source="Citizen app", when=None, language=None):
    a = analyze(text, language_hint=language)
    now = datetime.now()
    now_s = now.strftime(FMT)
    # Imported history: use the supplied time unless the text itself states a time
    if when is not None and a["relevant"] and a.get("time_basis") != "stated":
        a["incident_time"] = when.strftime(FMT)
    with db() as conn:
        incident_id, is_copy, created = None, 0, False
        if a["relevant"]:
            since = (now - timedelta(hours=24)).strftime(FMT)
            dup = conn.execute(
                "SELECT incident_id FROM reports WHERE text_hash=? AND relevant=1 AND created_at>=? "
                "AND incident_id IS NOT NULL ORDER BY id LIMIT 1", (a["text_hash"], since)).fetchone()
            if dup:
                incident_id, is_copy = dup["incident_id"], 1
            else:
                incident_id = find_match(conn, a)
            if incident_id is None:
                cur = conn.execute(
                    "INSERT INTO incidents (category, location_text, lat, lng, status, first_seen, last_seen, created_at) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (a["category"], a["location_text"], a["lat"], a["lng"], "unverified",
                     a["incident_time"], a["incident_time"], now_s))
                incident_id, created = cur.lastrowid, True
                conn.execute("INSERT INTO incident_events (incident_id,event_type,details,created_at) VALUES (?,?,?,?)",
                             (incident_id, "created", "Incident created from citizen report", now_s))
        cur = conn.execute(
            """INSERT INTO reports (text,text_hash,source,language,relevant,category,sub_issue,affected,location_text,
               lat,lng,geo_confidence,geo_method,incident_time,duration_min,sentiment,sentiment_score,severity_score,
               severity_label,severity_reason,incident_id,is_copy,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (a["clean_text"], a["text_hash"], source, a["language"], 1 if a["relevant"] else 0, a["category"],
             a["sub_issue"], a["affected"], a["location_text"], a["lat"], a["lng"], a["geo_confidence"],
             a["geo_method"], a["incident_time"], a["duration_min"], a["sentiment"], a["sentiment_score"],
             a["severity_score"], a["severity_label"], a["severity_reason"], incident_id, is_copy, now_s))
        report_id = cur.lastrowid
        incident = None
        if incident_id:
            conn.execute("INSERT INTO incident_events (incident_id,event_type,details,created_at) VALUES (?,?,?,?)",
                         (incident_id, "report", f"New citizen report attached ({'duplicate copy' if is_copy else 'independent report'})", now_s))
            recompute_incident(conn, incident_id)
            row = conn.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
            incident = dict(row) if row else None
    return {"report_id": report_id, "tracking_id": f"MDR-{report_id:06d}", "analysis": a, "incident": incident, "is_copy": bool(is_copy), "new_incident": created}