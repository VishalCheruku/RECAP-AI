import re


DEFAULT_REPORT_CONTACT = "+91996667724"
SURYA_REPORT_CONTACT = "+917013864843"
CALL_ELIGIBLE_RISKS = {"HIGH", "MEDIUM"}


DEMO_PATIENT_PROFILES = {
    "asha": {
        "display_name": "Asha Devi",
        "aliases": ("asha", "asha devi"),
        "risk_level": "HIGH",
        "risk_score": 92,
        "risk_factors": [
            "Demo policy: Asha is a high-risk patient",
            "Cardiac disease and hypertension require close monitoring",
        ],
    },
    "vikas": {
        "display_name": "Vikas",
        "aliases": ("vikas",),
        "risk_level": "HIGH",
        "risk_score": 90,
        "risk_factors": [
            "Demo policy: Vikas is a high-risk patient",
            "Cardiac history and prior MI require close monitoring",
        ],
    },
    "surya": {
        "display_name": "Surya",
        "aliases": ("surya",),
        "risk_level": "HIGH",
        "risk_score": 88,
        "risk_factors": [
            "Demo policy: Surya is a high-risk patient",
            "Cardiac disease signals require urgent follow-up",
        ],
    },
    "meena": {
        "display_name": "Meena Joseph",
        "aliases": ("meena", "meena joseph"),
        "risk_level": "HIGH",
        "risk_score": 84,
        "risk_factors": [
            "Demo policy: Meena is a high-risk patient",
            "Respiratory symptoms need active follow-up after discharge",
        ],
    },
    "ravi": {
        "display_name": "Ravi Kumar",
        "aliases": ("ravi", "ravi kumar"),
        "risk_level": "MEDIUM",
        "risk_score": 58,
        "risk_factors": [
            "Demo policy: Ravi is a medium-risk patient",
            "Diabetes and adherence risk need scheduled monitoring",
        ],
    },
    "vikram": {
        "display_name": "Vikram Singh",
        "aliases": ("vikram", "vikram singh"),
        "risk_level": "LOW",
        "risk_score": 18,
        "risk_factors": [
            "Demo policy: Vikram is a low-risk patient",
            "Only SMS monitoring is required for this demo case",
        ],
    },
}


def normalize_patient_key(value: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", (value or "").lower()).split())


def match_known_patient(name: str = "", text: str = "") -> tuple[str, dict] | tuple[None, None]:
    haystacks = [normalize_patient_key(name), normalize_patient_key(text[:1500])]
    for patient_key, profile in DEMO_PATIENT_PROFILES.items():
        aliases = {normalize_patient_key(alias) for alias in profile["aliases"]}
        for haystack in haystacks:
            tokens = f" {haystack} "
            if any(f" {alias} " in tokens for alias in aliases):
                return patient_key, profile
    return None, None


def get_demo_risk_profile(name: str = "", text: str = "") -> dict | None:
    _, profile = match_known_patient(name=name, text=text)
    return profile


def resolve_notification_phone(patient_name: str = "", extracted_text: str = "") -> str:
    patient_key, _ = match_known_patient(name=patient_name, text=extracted_text)
    return SURYA_REPORT_CONTACT if patient_key == "surya" else DEFAULT_REPORT_CONTACT


def should_call_patient(risk_level: str) -> bool:
    return (risk_level or "").upper() in CALL_ELIGIBLE_RISKS
