import os
from copy import deepcopy
from datetime import datetime, timezone

try:
    from pymongo import ASCENDING, MongoClient
    from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
except ImportError:
    ASCENDING = None
    MongoClient = None
    PyMongoError = Exception
    ServerSelectionTimeoutError = Exception


MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "recap_ai")

_client = None
_last_error = ""


DEMO_PATIENT_SEED = [
    {
        "name": "Asha Devi",
        "risk_level": "HIGH",
        "risk_score": 92,
        "phone": "+91996667724",
        "disease": "Acute coronary syndrome, hypertension, diabetes",
        "care_path": "SMS plus call",
    },
    {
        "name": "Ravi Kumar",
        "risk_level": "MEDIUM",
        "risk_score": 58,
        "phone": "+91996667724",
        "disease": "Diabetes with adherence risk",
        "care_path": "SMS plus call",
    },
    {
        "name": "Meena Joseph",
        "risk_level": "HIGH",
        "risk_score": 84,
        "phone": "+91996667724",
        "disease": "Respiratory illness",
        "care_path": "SMS plus call",
    },
    {
        "name": "Vikram Singh",
        "risk_level": "LOW",
        "risk_score": 18,
        "phone": "+91996667724",
        "disease": "Low-risk demo case",
        "care_path": "SMS only",
    },
    {
        "name": "Surya",
        "risk_level": "HIGH",
        "risk_score": 88,
        "phone": "+917013864843",
        "disease": "Cardiac disease",
        "care_path": "SMS plus call",
    },
    {
        "name": "Vikas",
        "risk_level": "HIGH",
        "risk_score": 90,
        "phone": "+91996667724",
        "disease": "Cardiac disease and prior MI",
        "care_path": "SMS plus call",
    },
]


def create_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_database():
    global _client, _last_error

    if MongoClient is None:
        _last_error = "pymongo is not installed"
        return None

    try:
        if _client is None:
            _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=1200)
            _client.admin.command("ping")
        return _client[MONGO_DB_NAME]
    except (PyMongoError, ServerSelectionTimeoutError, OSError) as error:
        _last_error = str(error)
        return None


def mongo_status() -> dict:
    db = get_database()
    return {
        "connected": db is not None,
        "database": MONGO_DB_NAME,
        "uri": MONGO_URI,
        "last_error": "" if db is not None else _last_error,
    }


def save_event(collection_name: str, document: dict) -> dict:
    db = get_database()
    if db is None:
        return {"saved": False, "collection": collection_name, "error": _last_error}

    payload = deepcopy(document)
    payload.setdefault("created_at", create_timestamp())
    result = db[collection_name].insert_one(payload)
    return {"saved": True, "collection": collection_name, "id": str(result.inserted_id)}


def list_recent(collection_name: str, limit: int = 10) -> list[dict]:
    db = get_database()
    if db is None:
        return []

    rows = db[collection_name].find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return list(rows)


def seed_demo_data() -> dict:
    db = get_database()
    if db is None:
        return {"saved": False, "error": _last_error}

    if ASCENDING is not None:
        db.demo_patients.create_index([("name", ASCENDING)], unique=True)

    now = create_timestamp()
    for patient in DEMO_PATIENT_SEED:
        payload = {
            **patient,
            "source": "panel_demo_seed",
            "updated_at": now,
        }
        db.demo_patients.update_one(
            {"name": patient["name"]},
            {
                "$set": payload,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    db.demo_events.delete_many({"source": "panel_demo_seed"})
    db.demo_events.insert_many(
        [
            {
                "source": "panel_demo_seed",
                "patient_name": patient["name"],
                "risk_level": patient["risk_level"],
                "phone": patient["phone"],
                "event": "Message relayed through SMS"
                if patient["risk_level"] == "LOW"
                else "Message relayed through SMS and call",
                "created_at": now,
            }
            for patient in DEMO_PATIENT_SEED
        ]
    )

    return {
        "saved": True,
        "database": MONGO_DB_NAME,
        "patients_seeded": len(DEMO_PATIENT_SEED),
        "events_seeded": len(DEMO_PATIENT_SEED),
    }
