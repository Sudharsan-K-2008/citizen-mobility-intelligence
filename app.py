import csv
import io
import os
import hmac

from dotenv import load_dotenv
load_dotenv()  # Load local .env before importing modules that read API keys.
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory, Response

from database import init_db, db, query_all, query_one
from nlp_engine import analyze
from service import submit_report, recompute_incident
from sample_data import SAMPLE_REPORTS, generate_demo
import locations as loc_mod

OFFICIAL_PIN = os.environ.get("OFFICIAL_PIN", "1234")   # change for real use
ALLOWED_SOURCES = {"Citizen app", "Social post", "News", "Complaint portal"}
VALID_STATUS = {"unverified", "verified", "resolved", "rejected"}

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0   # always serve fresh CSS/JS while developing
init_db()


def official_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        pin = request.headers.get("X-Official-Pin", "")
        if not hmac.compare_digest(pin.encode(), OFFICIAL_PIN.encode()):
            return jsonify(error="Official login required."), 401
        return fn(*args, **kwargs)
    return wrapper


def incident_where(args):
    where, params = ["1=1"], []
    status = args.get("status")
    if status:
        where.append("i.status=?"); params.append(status)
    else:
        where.append("i.status!='rejected'")
    if args.get("category"):
        where.append("i.category=?"); params.append(args["category"])
    if args.get("severity"):
        where.append("i.severity_label=?"); params.append(args["severity"])
    if args.get("date_from"):
        where.append("i.last_seen>=?"); params.append(args["date_from"] + " 00:00:00")
    if args.get("date_to"):
        where.append("i.first_seen<=?"); params.append(args["date_to"] + " 23:59:59")
    q = (args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        where.append("(i.location_text LIKE ? OR i.category LIKE ? OR i.id IN (SELECT incident_id FROM reports WHERE text LIKE ?))")
        params += [like, like, like]
    return " AND ".join(where), params


def incident_detail(iid):
    inc = query_one("SELECT * FROM incidents WHERE id=?", (iid,))
    if not inc:
        return None
    inc["reports"] = query_all("SELECT * FROM reports WHERE incident_id=? ORDER BY incident_time, id", (iid,))
    return inc


@app.get("/")
def home():
    return send_from_directory("static", "index.html")


@app.post("/api/login")
def login():
    pin = (request.get_json(silent=True) or {}).get("pin", "")
    if hmac.compare_digest(str(pin).encode(), OFFICIAL_PIN.encode()):
        return jsonify(ok=True)
    return jsonify(error="Incorrect PIN."), 401


@app.post("/api/analyze")
def preview():
    text = ((request.get_json(silent=True) or {}).get("text") or "").strip()
    if len(text) < 8:
        return jsonify(error="Please describe the issue in a few words."), 400
    return jsonify(analyze(text[:1000]))


@app.post("/api/reports")
def create_report():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if len(text) < 8:
        return jsonify(error="Please describe the issue in at least a few words."), 400
    if len(text) > 1000:
        return jsonify(error="Report is too long (max 1000 characters)."), 400
    source = data.get("source") if data.get("source") in ALLOWED_SOURCES else "Citizen app"
    return jsonify(submit_report(text, source)), 201


@app.get("/api/reports")
def list_reports():
    limit = min(int(request.args.get("limit", 20)), 200)
    return jsonify(query_all("SELECT * FROM reports ORDER BY id DESC LIMIT ?", (limit,)))


@app.get("/api/incidents")
def list_incidents():
    where, params = incident_where(request.args)
    rows = query_all(
        f"""SELECT i.*, (SELECT text FROM reports r WHERE r.incident_id=i.id ORDER BY r.id DESC LIMIT 1) AS sample_text
            FROM incidents i WHERE {where} ORDER BY i.severity_score DESC, i.last_seen DESC LIMIT 500""", params)
    return jsonify(rows)


@app.get("/api/incidents/<int:iid>")
def get_incident(iid):
    inc = incident_detail(iid)
    return (jsonify(inc), 200) if inc else (jsonify(error="Incident not found."), 404)


@app.patch("/api/incidents/<int:iid>")
@official_required
def update_incident(iid):
    data = request.get_json(silent=True) or {}
    with db() as conn:
        if not conn.execute("SELECT 1 FROM incidents WHERE id=?", (iid,)).fetchone():
            return jsonify(error="Incident not found."), 404
        if "status" in data:
            if data["status"] not in VALID_STATUS:
                return jsonify(error="Invalid status."), 400
            conn.execute("UPDATE incidents SET status=? WHERE id=?", (data["status"], iid))
        if "notes" in data:
            conn.execute("UPDATE incidents SET notes=? WHERE id=?", (str(data["notes"])[:1000], iid))
        recompute_incident(conn, iid)
    return jsonify(incident_detail(iid))


@app.get("/api/stats")
def stats():
    where, params = incident_where(request.args)
    frm = f"FROM incidents i WHERE {where}"
    active = "i.status IN ('unverified','verified')"
    today = datetime.now().date()
    start = (today - timedelta(days=6)).strftime("%Y-%m-%d 00:00:00")
    trend_rows = {r["d"]: r["c"] for r in query_all(
        "SELECT date(incident_time) d, COUNT(*) c FROM reports WHERE relevant=1 AND incident_time>=? GROUP BY d", (start,))}
    trend = []
    for k in range(6, -1, -1):
        d = (today - timedelta(days=k)).strftime("%Y-%m-%d")
        trend.append({"date": d, "count": trend_rows.get(d, 0)})
    return jsonify({
        "total_reports": query_one("SELECT COUNT(*) c FROM reports")["c"],
        "filtered_out": query_one("SELECT COUNT(*) c FROM reports WHERE relevant=0")["c"],
        "incidents": query_one(f"SELECT COUNT(*) c {frm}", params)["c"],
        "high_critical": query_one(f"SELECT COUNT(*) c {frm} AND i.severity_label IN ('High','Critical') AND {active}", params)["c"],
        "verified": query_one(f"SELECT COUNT(*) c {frm} AND i.status='verified'", params)["c"],
        "needs_review": query_one(f"SELECT COUNT(*) c {frm} AND i.lat IS NULL AND {active}", params)["c"],
        "by_category": query_all(
            f"SELECT i.category, COUNT(*) incidents, SUM(i.report_count) reports {frm} GROUP BY i.category ORDER BY incidents DESC", params),
        "top_areas": query_all(
            f"SELECT i.location_text area, SUM(i.report_count) count {frm} AND i.location_text IS NOT NULL "
            f"GROUP BY i.location_text ORDER BY count DESC LIMIT 6", params),
        "trend": trend,
    })


@app.post("/api/seed")
def seed():
    if request.args.get("size") == "large":
        items = generate_demo(150)
        for text, source, when in items:
            submit_report(text, source, when)
        return jsonify(loaded=len(items))
    for text, source in SAMPLE_REPORTS:
        submit_report(text, source)
    return jsonify(loaded=len(SAMPLE_REPORTS))
@app.post("/api/reset")
@official_required
def reset():
    with db() as conn:
        conn.execute("DELETE FROM reports")
        conn.execute("DELETE FROM incidents")
    return jsonify(ok=True)
TEXT_COLS = {"text", "report", "complaint", "description", "message", "post"}
SRC_COLS = {"source", "channel", "platform"}
TIME_COLS = {"timestamp", "time", "date", "datetime", "reported_at", "created_at"}
SOURCE_MAP = {s.lower(): s for s in ALLOWED_SOURCES}
IMPORT_MAX_ROWS = 500


def parse_ts(s):
    s = (s or "").strip()
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M",
              "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M", "%Y-%m-%d"):
        try:
            return min(datetime.strptime(s, f), datetime.now())
        except ValueError:
            pass
    return None


@app.get("/api/import-template.csv")
def import_template():
    d = datetime.now() - timedelta(days=1)
    rows = [
        ("Heavy traffic near Guindy because of an accident. Vehicles stuck for 30 minutes.", "Social post", d.strftime("%Y-%m-%d 08:30")),
        ("Waterlogging near Velachery railway station after heavy rain.", "Citizen app", d.strftime("%Y-%m-%d 09:10")),
        ("Huge pothole near Anna Nagar is causing problems for two-wheelers.", "Complaint portal", d.strftime("%Y-%m-%d 18:45")),
        ("Bus 29C is delayed by 40 minutes at Adyar.", "Complaint portal", d.strftime("%Y-%m-%d 19:05")),
    ]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["text", "source", "timestamp"])
    w.writerows(rows)
    return Response(buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=reports_template.csv"})


@app.post("/api/import")
@official_required
def import_reports():
    body = request.get_json(silent=True) or {}
    raw = (body.get("csv") or "").lstrip("\ufeff")
    online = bool(body.get("online"))
    if len(raw) > 1_000_000:
        return jsonify(error="File is too large (max 1 MB)."), 400
    lines = [l for l in raw.splitlines() if l.strip()]
    if not lines:
        return jsonify(error="Nothing to import. Choose a file or paste some reports."), 400

    try:
        first = [c.strip().lower() for c in next(csv.reader([lines[0]]))]
    except Exception:
        first = []
    if any(c in TEXT_COLS for c in first):
        ti = next(i for i, c in enumerate(first) if c in TEXT_COLS)
        si = next((i for i, c in enumerate(first) if c in SRC_COLS), None)
        ci = next((i for i, c in enumerate(first) if c in TIME_COLS), None)
        parsed = []
        for row in csv.reader(lines[1:]):
            if len(row) <= ti:
                parsed.append(("", None, None)); continue
            src = row[si].strip() if si is not None and si < len(row) else None
            when = parse_ts(row[ci]) if ci is not None and ci < len(row) else None
            parsed.append((row[ti].strip(), src, when))
    else:   # no header: one report per line
        parsed = [(l.strip().strip('"'), None, None) for l in lines]

    truncated = len(parsed) > IMPORT_MAX_ROWS
    parsed = parsed[:IMPORT_MAX_ROWS]
    parsed.sort(key=lambda p: p[2] or datetime.now())      # oldest first so grouping works

    s = dict(rows=len(parsed), imported=0, transport=0, filtered=0, new_incidents=0,
             grouped=0, copies=0, skipped=0, truncated=truncated)
    old = loc_mod.ENABLE_ONLINE
    loc_mod.ENABLE_ONLINE = online        # offline lookup keeps big imports fast
    try:
        for text, src, when in parsed:
            if len(text) < 8 or len(text) > 1000:
                s["skipped"] += 1
                continue
            res = submit_report(text, SOURCE_MAP.get((src or "").lower(), "Citizen app"), when)
            s["imported"] += 1
            if res["analysis"]["relevant"]:
                s["transport"] += 1
                if res["is_copy"]:
                    s["copies"] += 1
                elif res["new_incident"]:
                    s["new_incidents"] += 1
                else:
                    s["grouped"] += 1
            else:
                s["filtered"] += 1
    finally:
        loc_mod.ENABLE_ONLINE = old
    return jsonify(s)

def _safe(v):
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s


@app.get("/api/export.csv")
@official_required
def export_csv():
    where, params = incident_where(request.args)
    rows = query_all(f"SELECT i.* FROM incidents i WHERE {where} ORDER BY i.severity_score DESC", params)
    cols = ["id", "category", "location_text", "lat", "lng", "severity_label", "severity_score", "status",
            "report_count", "independent_count", "confidence", "first_seen", "last_seen", "notes"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([_safe(r[c]) for c in cols])
    return Response(buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=incidents.csv"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)