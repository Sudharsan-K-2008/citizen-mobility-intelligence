SAMPLE_REPORTS = [
    ("Heavy traffic near Guindy because of an accident. Vehicles are stuck for more than 30 minutes.", "Social post"),
    ("A vehicle collision has blocked the road at Guindy. Ambulance is on the way.", "Citizen app"),
    ("Accident near Guindy bridge. Traffic completely stopped.", "News"),
    ("Heavy traffic near Guindy because of an accident. Vehicles are stuck for more than 30 minutes.", "Social post"),
    ("Waterlogging reported near Velachery railway station after heavy rain.", "Citizen app"),
    ("A huge amount of water has accumulated near Velachery railway station after continuous rainfall. School buses are unable to move properly, and people are struggling to cross the road.", "Citizen app"),
    ("Heavy waterlogging near Velachery. Vehicles are moving very slowly.", "Social post"),
    ("A huge pothole near Anna Nagar is causing problems for two-wheelers.", "Citizen app"),
    ("Bus 21G is delayed by 40 minutes at Tambaram railway station. Very frustrated!!", "Complaint portal"),
    ("The entire road near Tambaram is flooded!", "Social post"),
    ("Road blocked due to construction at Kathipara flyover. Diversion in place.", "News"),
    ("Massive traffic jam in T Nagar, can't move my vehicle for 45 minutes.", "Citizen app"),
    ("Tree fell on road near Mylapore. Traffic diverted, road closed.", "Citizen app"),
    ("The road near my college is damaged. Two-wheelers are struggling to pass.", "Citizen app"),
    ("OMR Sholinganallur la romba traffic, vandi nikkudhu. Worst jam ever!", "Social post"),
    ("Accident near Koyambedu yesterday at 9:15 PM. Two vehicles collided, one person injured.", "News"),
    ("Metro work causing slow moving traffic at Vadapalani since morning.", "Complaint portal"),
    ("Minor pothole on Anna Salai near Teynampet, dangerous for bikes.", "Citizen app"),
    ("Bus not coming on route 29C at Adyar for over an hour. Very frustrated!!", "Complaint portal"),
    ("Water stagnation near Mambalam subway, vehicles struggling to cross.", "Citizen app"),
    ("I love travelling by bus.", "Social post"),
    ("The weather is beautiful today.", "Social post"),
    ("Traffic is moving normally on ECR.", "Social post"),
]
import random
from datetime import datetime, timedelta

HOTSPOTS = {
    "Velachery": ["waterlogging", "waterlogging", "congestion", "road_damage"],
    "Guindy": ["accident", "congestion", "congestion", "road_closure"],
    "Tambaram": ["waterlogging", "public_transport", "congestion"],
    "Anna Nagar": ["road_damage", "congestion", "public_transport"],
    "T Nagar": ["congestion", "congestion", "road_closure"],
    "Adyar": ["public_transport", "waterlogging", "congestion"],
    "Mylapore": ["road_closure", "congestion", "road_damage"],
    "Koyambedu": ["accident", "congestion", "public_transport"],
    "Vadapalani": ["road_closure", "congestion"],
    "Porur": ["congestion", "accident", "road_damage"],
    "Chromepet": ["congestion", "accident", "road_closure"],
    "Sholinganallur": ["congestion", "congestion", "waterlogging"],
    "Thiruvanmiyur": ["waterlogging", "congestion"],
    "Saidapet": ["accident", "road_damage", "congestion"],
    "Kathipara Flyover": ["accident", "congestion", "road_closure"],
    "Pallavaram": ["congestion", "road_damage"],
    "Medavakkam": ["waterlogging", "road_damage"],
    "Egmore": ["congestion", "public_transport"],
    "Perambur": ["road_closure", "public_transport"],
    "Ambattur": ["congestion", "accident"],
}

TEMPLATES = {
    "accident": [
        "Accident near {p}. Two vehicles collided, traffic is badly affected.",
        "Vehicle collision reported at {p}. Road blocked for about {m} minutes.",
        "Bike skid and accident near {p}, one person injured, ambulance called.",
        "Accident near {p} bridge. Traffic completely stopped.",
    ],
    "congestion": [
        "Heavy traffic near {p}. Vehicles stuck for {m} minutes.",
        "Massive traffic jam at {p}, nothing is moving.",
        "{p} la romba traffic, vandi nikkudhu. Worst jam ever!",
        "Slow moving traffic near {p}, very frustrating for commuters.",
    ],
    "waterlogging": [
        "Waterlogging near {p} after heavy rain. Vehicles moving very slowly.",
        "Road flooded near {p}, two-wheelers struggling to pass.",
        "Knee-deep water near {p}. Buses are avoiding the stretch.",
    ],
    "road_damage": [
        "Huge pothole near {p} is dangerous for two-wheelers.",
        "Damaged road near {p}, vehicles are struggling to pass.",
        "Deep pothole near {p}, someone nearly fell from a bike.",
    ],
    "public_transport": [
        "Bus is delayed by {m} minutes at {p}. Very frustrated!!",
        "Bus not coming at {p} for over an hour.",
        "Buses are overcrowded and late at {p}, commuters stranded.",
    ],
    "road_closure": [
        "Road closed near {p} due to construction. Diversion in place.",
        "Tree fell on road near {p}. Road blocked.",
        "Metro work causing road closure near {p}, traffic diverted.",
    ],
}

SOURCES = ["Citizen app", "Citizen app", "Social post", "Social post", "News", "Complaint portal"]
IRRELEVANT = ["I love travelling by bus.", "The weather is beautiful today.", "Traffic is moving normally on ECR."]


def generate_demo(n=150, seed=7):
    """Realistic Chennai demo reports spread over the last 7 days, with bursts that group into incidents."""
    rnd = random.Random(seed)
    now = datetime.now().replace(second=0, microsecond=0)
    out = []
    while len(out) < n:
        place = rnd.choice(list(HOTSPOTS))
        cat = rnd.choice(HOTSPOTS[place])
        day = rnd.choices(range(7), weights=[6, 5, 4, 3, 3, 2, 2])[0]
        hour = rnd.choice([7, 8, 8, 9, 9, 10, 12, 15, 17, 18, 18, 19, 20, 21])
        when = (now - timedelta(days=day)).replace(hour=hour, minute=rnd.randint(0, 59))
        if when > now:
            when -= timedelta(days=1)
        burst = 1 if rnd.random() > 0.4 else rnd.randint(2, 4)
        for _ in range(burst):
            text = rnd.choice(TEMPLATES[cat]).format(p=place, m=rnd.choice([20, 30, 40, 45, 60]))
            t = min(now, when + timedelta(minutes=rnd.randint(0, 50)))
            out.append((text, rnd.choice(SOURCES), t))
        if rnd.random() < 0.06:
            out.append((rnd.choice(IRRELEVANT), "Social post", when))
    out = out[:n]
    out.sort(key=lambda x: x[2])
    return out