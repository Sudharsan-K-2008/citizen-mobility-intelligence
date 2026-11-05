import os
import re
import time
import requests
from database import query_one, execute

ENABLE_ONLINE = os.environ.get("ENABLE_ONLINE_GEOCODING", "1") == "1"
_last_call = 0.0

# (canonical name, lat, lng, [aliases])
PLACES = [
    ("Velachery Railway Station", 12.9810, 80.2210, ["velachery railway station", "velachery station", "velachery mrts"]),
    ("Velachery", 12.9815, 80.2180, ["velachery", "vellachery"]),
    ("Guindy", 13.0067, 80.2206, ["guindy"]),
    ("Kathipara Flyover", 13.0068, 80.2046, ["kathipara", "kathipara flyover", "kathipara junction"]),
    ("Tambaram Railway Station", 12.9266, 80.1176, ["tambaram railway station", "tambaram station"]),
    ("Tambaram", 12.9249, 80.1000, ["tambaram"]),
    ("Anna Nagar", 13.0850, 80.2101, ["anna nagar"]),
    ("T Nagar", 13.0418, 80.2341, ["t nagar", "tnagar", "thyagaraya nagar", "pondy bazaar"]),
    ("Adyar", 13.0012, 80.2565, ["adyar"]),
    ("Mylapore", 13.0368, 80.2676, ["mylapore"]),
    ("Egmore", 13.0732, 80.2609, ["egmore"]),
    ("Chennai Central", 13.0827, 80.2757, ["chennai central", "central station", "central railway station"]),
    ("Koyambedu", 13.0694, 80.1948, ["koyambedu", "cmbt"]),
    ("Vadapalani", 13.0500, 80.2121, ["vadapalani"]),
    ("Porur", 13.0382, 80.1565, ["porur"]),
    ("Chromepet", 12.9516, 80.1462, ["chromepet"]),
    ("Pallavaram", 12.9675, 80.1491, ["pallavaram"]),
    ("Sholinganallur", 12.9010, 80.2279, ["sholinganallur", "sholinganalur"]),
    ("OMR (Old Mahabalipuram Road)", 12.9516, 80.2400, ["omr", "old mahabalipuram road"]),
    ("ECR (East Coast Road)", 12.9490, 80.2590, ["ecr", "east coast road"]),
    ("Thoraipakkam", 12.9420, 80.2370, ["thoraipakkam"]),
    ("Perungudi", 12.9650, 80.2461, ["perungudi"]),
    ("Thiruvanmiyur", 12.9830, 80.2594, ["thiruvanmiyur", "tiruvanmiyur"]),
    ("Besant Nagar", 13.0003, 80.2667, ["besant nagar", "besantnagar"]),
    ("Nungambakkam", 13.0569, 80.2425, ["nungambakkam"]),
    ("Kodambakkam", 13.0521, 80.2255, ["kodambakkam"]),
    ("Ashok Nagar", 13.0373, 80.2123, ["ashok nagar"]),
    ("Saidapet", 13.0213, 80.2231, ["saidapet"]),
    ("Marina Beach", 13.0500, 80.2824, ["marina beach", "marina"]),
    ("Triplicane", 13.0585, 80.2760, ["triplicane"]),
    ("Royapettah", 13.0543, 80.2640, ["royapettah"]),
    ("Perambur", 13.1210, 80.2330, ["perambur"]),
    ("Tondiarpet", 13.1260, 80.2900, ["tondiarpet"]),
    ("Washermanpet", 13.1127, 80.2870, ["washermanpet"]),
    ("Ambattur", 13.1143, 80.1548, ["ambattur"]),
    ("Avadi", 13.1067, 80.0970, ["avadi"]),
    ("Poonamallee", 13.0473, 80.0945, ["poonamallee"]),
    ("Medavakkam", 12.9200, 80.1920, ["medavakkam"]),
    ("Pallikaranai", 12.9300, 80.2100, ["pallikaranai"]),
    ("Madipakkam", 12.9620, 80.1980, ["madipakkam"]),
    ("Chennai Airport", 12.9941, 80.1709, ["chennai airport", "airport", "meenambakkam"]),
    ("St. Thomas Mount", 12.9955, 80.1978, ["st thomas mount", "thomas mount"]),
    ("Alandur", 13.0025, 80.2010, ["alandur"]),
    ("Vandalur", 12.8920, 80.0810, ["vandalur"]),
    ("Kilpauk", 13.0836, 80.2400, ["kilpauk"]),
    ("Aminjikarai", 13.0730, 80.2220, ["aminjikarai"]),
    ("Thirumangalam", 13.0850, 80.2020, ["thirumangalam"]),
    ("Mogappair", 13.0830, 80.1750, ["mogappair"]),
    ("Villivakkam", 13.1080, 80.2070, ["villivakkam"]),
    ("Kolathur", 13.1190, 80.2190, ["kolathur"]),
    ("Teynampet", 13.0440, 80.2500, ["teynampet"]),
    ("Alwarpet", 13.0330, 80.2540, ["alwarpet"]),
    ("Mandaveli", 13.0270, 80.2620, ["mandaveli"]),
    ("Ekkaduthangal", 13.0170, 80.2040, ["ekkaduthangal"]),
    ("Perungalathur", 12.9035, 80.0900, ["perungalathur"]),
    ("Maduravoyal", 13.0630, 80.1650, ["maduravoyal"]),
    ("Valasaravakkam", 13.0420, 80.1750, ["valasaravakkam"]),
    ("Ramapuram", 13.0300, 80.1850, ["ramapuram"]),
    ("Anna Salai (Mount Road)", 13.0560, 80.2540, ["anna salai", "mount road"]),
    ("Anna University", 13.0107, 80.2354, ["anna university"]),
    ("IIT Madras", 12.9916, 80.2336, ["iit madras", "iitm"]),
    ("Manali", 13.1660, 80.2640, ["manali"]),
    ("Ennore", 13.2140, 80.3200, ["ennore"]),
    ("Red Hills", 13.1850, 80.1900, ["red hills", "redhills"]),
    ("Siruseri", 12.8250, 80.2250, ["siruseri"]),
    ("Guduvanchery", 12.8450, 80.0600, ["guduvanchery"]),
]


def _norm(t):
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


ALIASES = sorted(
    ((_norm(a), name, lat, lng) for name, lat, lng, als in PLACES for a in als),
    key=lambda x: -len(x[0]),
)


def _match_gazetteer(text):
    padded = f" {_norm(text)} "
    chosen = []
    for alias, name, lat, lng in ALIASES:           # longest alias first
        needle = f" {alias} "
        idx = padded.find(needle)
        if idx == -1:
            continue
        span = (idx + 1, idx + len(needle) - 1)
        if any(not (span[1] <= s[0] or span[0] >= s[1]) for s, _ in chosen):
            continue
        chosen.append((span, (name, lat, lng)))
    if not chosen:
        return None
    chosen.sort(key=lambda c: c[0][0])               # earliest mention wins
    name, lat, lng = chosen[0][1]
    return {"name": name, "lat": lat, "lng": lng, "confidence": 0.9, "method": "gazetteer"}


CANDIDATE_RX = re.compile(
    r"(?i:\b(?:near|at|in|opposite|around|beside|behind)\s+)"
    r"([A-Z][A-Za-z0-9 .'\-]{2,40}?)"
    r"(?=[.,;!?]|\s(?i:because|due|after|and|with|is|are|was|where|causing|for|since)\b|$)"
)


def _candidate(text):
    m = CANDIDATE_RX.search(text)
    return m.group(1).strip() if m else None


def geocode_online(candidate):
    """OpenStreetMap Nominatim, limited to the Chennai area, cached, max 1 request/second."""
    global _last_call
    if not ENABLE_ONLINE:
        return None
    key = candidate.lower().strip()
    cached = query_one("SELECT lat, lng FROM geocache WHERE query=?", (key,))
    if cached:
        return (cached["lat"], cached["lng"]) if cached["lat"] is not None else None
    try:
        wait = 1.1 - (time.time() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.time()
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": f"{candidate}, Chennai", "format": "json", "limit": 1,
                    "viewbox": "79.95,13.30,80.35,12.80", "bounded": 1},
            headers={"User-Agent": "CitizenMobilityIntelligence/1.0 (student prototype)"},
            timeout=4,
        )
        data = r.json()
        if data:
            lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
            execute("INSERT OR REPLACE INTO geocache VALUES (?,?,?)", (key, lat, lng))
            return lat, lng
        execute("INSERT OR REPLACE INTO geocache VALUES (?,?,?)", (key, None, None))
    except Exception:
        pass
    return None


def locate_name(name):
    """Resolve a place name (gazetteer first, then OpenStreetMap)."""
    g = _match_gazetteer(name)
    if g:
        return g
    res = geocode_online(name)
    if res:
        return {"name": name, "lat": res[0], "lng": res[1], "confidence": 0.6, "method": "openstreetmap"}
    return {"name": name, "lat": None, "lng": None, "confidence": 0.0, "method": "unresolved"}


def find_location(text):
    """Find where a report is talking about. Never invents a location."""
    g = _match_gazetteer(text)
    if g:
        return g
    cand = _candidate(text)
    if cand:
        return locate_name(cand)
    return {"name": None, "lat": None, "lng": None, "confidence": 0.0, "method": "none"}