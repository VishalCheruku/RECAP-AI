import re

from patient_policy import get_demo_risk_profile


AGE_BANDS = [
    {"minimum": 76, "points": 40, "factor": "Age above 75"},
    {"minimum": 61, "points": 30, "factor": "Age above 60"},
    {"minimum": 46, "points": 10, "factor": "Age above 45"},
]

CLINICAL_SIGNALS = [
    {
        "label": "Acute cardiac disease",
        "points": 42,
        "patterns": (
            r"\bstemi\b",
            r"acute coronary",
            r"heart failure",
            r"coronary artery disease",
            r"chest pain",
            r"myocardial infarction",
            r"\bmi\b",
            r"\bpci\b",
            r"stent",
        ),
    },
    {
        "label": "Diabetes or poor glycemic control",
        "points": 28,
        "patterns": (
            r"diabetes",
            r"insulin",
            r"metformin",
            r"glipizide",
            r"hba1c",
            r"hypergly",
            r"ketoacidosis",
        ),
    },
    {
        "label": "Respiratory disease",
        "points": 30,
        "patterns": (
            r"\bcopd\b",
            r"asthma",
            r"pneumonia",
            r"wheez",
            r"dyspnea",
            r"breathlessness",
            r"salbutamol",
            r"theophylline",
            r"tiotropium",
            r"nebul",
        ),
    },
    {
        "label": "Kidney or stroke history",
        "points": 26,
        "patterns": (
            r"kidney disease",
            r"renal disease",
            r"\bckd\b",
            r"creatinine",
            r"stroke",
            r"cva",
        ),
    },
    {
        "label": "Hypertension or vascular risk",
        "points": 18,
        "patterns": (
            r"hypertension",
            r"high bp",
            r"blood pressure",
            r"amlodipine",
            r"lisinopril",
            r"metoprolol",
        ),
    },
    {
        "label": "Admission or adherence concern",
        "points": 34,
        "patterns": (
            r"prior admission",
            r"previous admission",
            r"previous hospital admission",
            r"readmitted",
            r"recurrent hospitalization",
            r"non[- ]?compliant",
            r"missed medication",
            r"poor adherence",
        ),
    },
    {
        "label": "Urgent warning signs",
        "points": 20,
        "patterns": (
            r"oxygen saturation.*(?:8[0-9]|90)",
            r"spo2.*(?:8[0-9]|90)",
            r"fever",
            r"elevated troponin",
            r"acute kidney injury",
            r"severe",
            r"emergency",
        ),
    },
]

EXPLICIT_RISK_SIGNALS = [
    {
        "level": "HIGH",
        "score": 86,
        "factor": "Document marks patient as high risk",
        "patterns": (
            r"risk stratification\s*[:\-]?\s*high",
            r"risk assessment\s*[:\-]?\s*high",
            r"high risk of readmission",
            r"high discharge risk",
            r"high risk patient",
        ),
    },
    {
        "level": "MEDIUM",
        "score": 58,
        "factor": "Document marks patient as medium risk",
        "patterns": (
            r"risk stratification\s*[:\-]?\s*medium",
            r"risk assessment\s*[:\-]?\s*medium",
            r"medium risk",
            r"moderate readmission risk",
        ),
    },
    {
        "level": "LOW",
        "score": 24,
        "factor": "Document marks patient as low risk",
        "patterns": (
            r"risk stratification\s*[:\-]?\s*low",
            r"risk assessment\s*[:\-]?\s*low",
            r"low risk",
            r"readmission risk is low",
        ),
    },
]

RISK_THRESHOLDS = [
    ("HIGH", 75),
    ("MEDIUM", 45),
    ("LOW", 0),
]


def calculate_risk(extracted_text: str, patient_data: dict) -> tuple[str, int, list[str]]:
    analysis = clinical_ai_risk_assessment(extracted_text, patient_data)
    return analysis["risk_level"], analysis["risk_score"], analysis["risk_factors"]


def calculate_risk_from_inputs(patient_data: dict) -> tuple[str, int, list[str]]:
    text = " ".join(
        str(patient_data.get(field, ""))
        for field in ("name", "disease", "history", "medical_history")
    )
    analysis = clinical_ai_risk_assessment(text, patient_data)
    return analysis["risk_level"], analysis["risk_score"], analysis["risk_factors"]


def clinical_ai_risk_assessment(extracted_text: str, patient_data: dict) -> dict:
    text = normalize_text(extracted_text)
    patient_name = patient_data.get("name", "")
    demo_profile = get_demo_risk_profile(name=patient_name, text=text)

    signal_score, signal_factors = score_document_signals(text, patient_data)
    explicit_signal = detect_explicit_risk(text)

    if explicit_signal:
        signal_score = max(signal_score, explicit_signal["score"])
        signal_factors.append(explicit_signal["factor"])

    inferred_level = level_from_score(signal_score)
    inferred_result = {
        "risk_level": inferred_level,
        "risk_score": signal_score,
        "risk_factors": dedupe_factors(signal_factors) or ["AI found no major readmission signals"],
    }

    return apply_demo_profile(demo_profile, inferred_result)


def score_document_signals(text: str, patient_data: dict) -> tuple[int, list[str]]:
    age_score, age_factor = score_age(patient_data.get("age", 0))
    matched_signals = [
        signal
        for signal in CLINICAL_SIGNALS
        if any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in signal["patterns"])
    ]
    signal_points = sum(signal["points"] for signal in matched_signals)
    factors = [signal["label"] for signal in matched_signals]
    factors = ([age_factor] if age_factor else []) + factors
    return min(age_score + signal_points, 100), factors


def score_age(age) -> tuple[int, str]:
    try:
        age_value = int(age)
    except (TypeError, ValueError):
        age_value = 0

    band = next((item for item in AGE_BANDS if age_value >= item["minimum"]), None)
    return (band["points"], band["factor"]) if band else (0, "")


def detect_explicit_risk(text: str) -> dict | None:
    return next(
        (
            {"level": signal["level"], "score": signal["score"], "factor": signal["factor"]}
            for signal in EXPLICIT_RISK_SIGNALS
            if any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in signal["patterns"])
        ),
        None,
    )


def level_from_score(score: int) -> str:
    return next(level for level, minimum in RISK_THRESHOLDS if score >= minimum)


def apply_demo_profile(profile: dict | None, inferred_result: dict) -> dict:
    if not profile:
        return inferred_result

    factors = dedupe_factors(profile["risk_factors"] + inferred_result["risk_factors"])
    return {
        "risk_level": profile["risk_level"],
        "risk_score": profile["risk_score"],
        "risk_factors": factors,
    }


def dedupe_factors(factors: list[str]) -> list[str]:
    seen = set()
    unique = []
    for factor in factors:
        normalized = factor.strip().lower()
        if normalized and normalized not in seen:
            unique.append(factor)
            seen.add(normalized)
    return unique


def normalize_text(text: str) -> str:
    return " ".join((text or "").replace("\u00a0", " ").split()).lower()
