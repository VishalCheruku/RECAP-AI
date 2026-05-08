import io
import json
import os
import re
import shutil

import fitz
import pytesseract
from PIL import Image, ImageFilter, ImageOps
from pytesseract import TesseractNotFoundError


DISEASE_KEYWORDS = [
    "acute coronary syndrome",
    "diabetes",
    "hypertension",
    "heart disease",
    "cardiac",
    "heart failure",
    "coronary artery disease",
    "copd",
    "asthma",
    "kidney disease",
    "renal disease",
    "stroke",
    "cancer",
    "pneumonia",
    "hyperglycemia",
    "ketoacidosis",
    "anemia",
    "allergic rhinitis",
    "fever",
    "infection",
]

MEDICINE_DISEASE_HINTS = {
    "metformin": "Diabetes",
    "insulin": "Diabetes",
    "glipizide": "Diabetes",
    "aspirin": "Cardiac",
    "clopidogrel": "Cardiac",
    "atorvastatin": "Cardiac",
    "metoprolol": "Hypertension",
    "lisinopril": "Hypertension",
    "amlodipine": "Hypertension",
    "salbutamol": "Asthma",
    "salmeterol": "Asthma",
    "fluticasone": "Asthma",
    "tiotropium": "COPD",
    "ipratropium": "COPD",
    "theophylline": "COPD",
    "amoxicillin": "Infection",
    "cefotaxime": "Infection",
    "prednisolone": "Inflammatory condition",
}


def configure_tesseract() -> None:
    if shutil.which("tesseract"):
        return

    common_windows_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]

    for executable_path in common_windows_paths:
        if os.path.exists(executable_path):
            pytesseract.pytesseract.tesseract_cmd = executable_path
            return


def is_tesseract_available() -> bool:
    configure_tesseract()
    configured_path = getattr(pytesseract.pytesseract, "tesseract_cmd", "tesseract")
    return bool(shutil.which(configured_path) or os.path.exists(configured_path))


def run_ocr(image: Image.Image) -> str:
    configure_tesseract()

    if not is_tesseract_available():
        raise RuntimeError(
            "This file needs OCR, but Tesseract is not installed or not available in PATH. "
            "Upload a TXT, JSON, or selectable-text PDF, or install Tesseract for scanned images."
        )

    try:
        prepared_image = preprocess_image(image)
        attempts = [
            "--oem 3 --psm 6",
            "--oem 3 --psm 4",
            "--oem 3 --psm 11",
        ]
        outputs = [
            pytesseract.image_to_string(prepared_image, config=config).strip()
            for config in attempts
        ]
        return max(outputs, key=len)
    except TesseractNotFoundError as error:
        raise RuntimeError(
            "Tesseract OCR is not installed or not available in PATH. "
            "Install Tesseract and restart the backend."
        ) from error


def preprocess_image(image: Image.Image) -> Image.Image:
    prepared = ImageOps.exif_transpose(image).convert("L")
    prepared = ImageOps.autocontrast(prepared)
    width, height = prepared.size
    if max(width, height) < 1800:
        prepared = prepared.resize((width * 2, height * 2), Image.Resampling.LANCZOS)
    return prepared.filter(ImageFilter.SHARPEN)


def extract_document_text(filename: str, file_bytes: bytes) -> str:
    lower_name = filename.lower()

    if lower_name.endswith(".txt"):
        return extract_text_from_plain_file(file_bytes)

    if lower_name.endswith(".json"):
        return extract_text_from_json_file(file_bytes)

    if lower_name.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)

    return extract_text_from_image(file_bytes)


def extract_text_from_plain_file(file_bytes: bytes) -> str:
    return decode_text_file(file_bytes)


def extract_text_from_json_file(file_bytes: bytes) -> str:
    raw_text = decode_text_file(file_bytes)

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as error:
        raise RuntimeError("Uploaded JSON file is not valid JSON.") from error

    return json_payload_to_text(payload)


def decode_text_file(file_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue

    raise RuntimeError("Uploaded text file could not be decoded.")


def json_payload_to_text(payload) -> str:
    if isinstance(payload, str):
        return payload

    if isinstance(payload, list):
        return "\n".join(json_payload_to_text(item) for item in payload)

    if isinstance(payload, dict):
        lines = []
        preferred_fields = [
            "name",
            "patient_name",
            "age",
            "disease",
            "diagnosis",
            "history",
            "medical_history",
            "prior_admission",
            "discharge_summary",
            "summary",
            "text",
            "content",
        ]

        for field in preferred_fields:
            if field in payload:
                lines.append(format_json_field(field, payload[field]))

        for key, value in payload.items():
            if key not in preferred_fields:
                lines.append(format_json_field(key, value))

        return "\n".join(line for line in lines if line)

    if payload is None:
        return ""

    return str(payload)


def format_json_field(key: str, value) -> str:
    label = key.replace("_", " ").title()
    text_value = json_payload_to_text(value)

    if not text_value:
        return ""

    return f"{label}: {text_value}"


def extract_text_from_image(file_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(file_bytes))
    return clean_ocr_text(run_ocr(image))


def extract_text_from_pdf(file_bytes: bytes) -> str:
    pdf_document = fitz.open(stream=file_bytes, filetype="pdf")
    native_text = extract_native_pdf_text(pdf_document)

    if native_text.strip():
        pdf_document.close()
        return native_text

    if not is_tesseract_available():
        pdf_document.close()
        raise RuntimeError(
            "This PDF looks scanned and needs OCR, but Tesseract is not installed or not available in PATH. "
            "Upload a TXT/JSON version, a selectable-text PDF, or install Tesseract for scanned PDFs."
        )

    text_parts = []

    for page in pdf_document:
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image_bytes = pixmap.tobytes("png")
        image = Image.open(io.BytesIO(image_bytes))
        text_parts.append(run_ocr(image))

    pdf_document.close()
    return clean_ocr_text("\n".join(text_parts))


def extract_native_pdf_text(pdf_document) -> str:
    text_parts = []

    for page in pdf_document:
        text_parts.append(page.get_text("text"))

    return clean_ocr_text("\n".join(text_parts))


def clean_ocr_text(text: str) -> str:
    replacements = {
        "\ufeff": "",
        "\u00a0": " ",
        "Â": "",
        "Î¼": "mcg",
        "|": " ",
    }
    cleaned = text or ""
    for source, target in replacements.items():
        cleaned = cleaned.replace(source, target)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def parse_patient_data(text: str) -> dict:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    lower_text = text.lower()

    return {
        "name": extract_name(lines, text),
        "age": extract_age(lines, lower_text),
        "disease": extract_disease(lower_text),
        "history": extract_history(text),
        "phone": extract_phone(text),
        "medications": extract_medications(lines),
        "discharge_date": extract_discharge_date(text),
    }


def extract_name(lines: list[str], text: str) -> str:
    for line in lines:
        match = re.search(
            r"(?:patient\s+name|patient(?!\s*id)|pt\.?\s*name|name)[:\-]?\s*(.+)",
            line,
            flags=re.IGNORECASE,
        )
        if not match:
            continue

        value = match.group(1)
        value = re.split(
            r"\b(age|sex|gender|diagnosis|disease|admission|mobile|phone|contact|male|female)\b",
            value,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0]
        value = re.sub(r"[^A-Za-z ]", " ", value)
        value = " ".join(value.split())

        if value.lower() in {"information", "details", "profile"}:
            continue

        if value:
            return value.title()

    fallback_match = re.search(
        r"(?:patient\s+name|pt\.?\s*name|name)[:\-]?\s*([A-Za-z ]{2,50})",
        text,
        flags=re.IGNORECASE,
    )
    if fallback_match:
        return " ".join(fallback_match.group(1).split()).title()

    return "Not Found"


def extract_age(lines: list[str], text: str) -> int:
    line_patterns = [
        r"age[:.\-]?\s*(\d{1,3})",
        r"\b(\d{1,3})\s*/\s*[mf]\b",
        r"\b(\d{1,3})\s*(?:years?|yrs?)\b",
        r"\b(\d{1,3})\s*(?:year|yr|y)[-/ ]?(?:old)?\b",
        r"\bage\s*[/:\-]?\s*(\d{1,3})\s*[/\-]?\s*[mf]?\b",
        r"\b([mf])\s*/\s*(\d{1,3})\b",
    ]

    for line in lines:
        for pattern in line_patterns:
            match = re.search(pattern, line, flags=re.IGNORECASE)
            if match:
                return extract_age_value(match)

    patterns = [
        r"age[:.\-]?\s*(\d{1,3})",
        r"(\d{1,3})\s*years?",
        r"\b(\d{1,3})\s*/\s*[mf]\b",
        r"\b(\d{1,3})\s*(?:year|yr|y)[-/ ]?(?:old)?\b",
        r"\bage\s*[/:\-]?\s*(\d{1,3})\s*[/\-]?\s*[mf]?\b",
        r"\b([mf])\s*/\s*(\d{1,3})\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return extract_age_value(match)

    return 0


def extract_age_value(match: re.Match) -> int:
    for group in match.groups():
        if group and group.isdigit():
            return int(group)

    return 0


def extract_disease(text: str) -> str:
    found_diseases = []

    for keyword in DISEASE_KEYWORDS:
        if keyword in text:
            formatted_name = keyword.title()
            if formatted_name not in found_diseases:
                found_diseases.append(formatted_name)

    for disease in extract_diagnosis_sections(text):
        if disease not in found_diseases:
            found_diseases.append(disease)

    for medicine, disease in MEDICINE_DISEASE_HINTS.items():
        if medicine in text and disease not in found_diseases:
            found_diseases.append(disease)

    if found_diseases:
        return ", ".join(found_diseases)

    return "Not Found"


def extract_diagnosis_sections(text: str) -> list[str]:
    section_patterns = [
        r"(?:diagnosis|diagnoses|dx|provisional diagnosis|clinical impression|assessment)[:\-]?\s*(.+?)(?:\n\s*\n|medications|rx|advice|follow|history|$)",
        r"(?:complaints?|c/o)[:\-]?\s*(.+?)(?:\n\s*\n|diagnosis|diagnoses|dx|rx|medications|advice|$)",
    ]
    diseases = []

    for pattern in section_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE | re.DOTALL):
            candidate = " ".join(match.group(1).split())
            for part in re.split(r"[,;/]|\s+-\s+", candidate):
                cleaned = clean_condition_name(part)
                if cleaned and cleaned not in diseases:
                    diseases.append(cleaned)

    return diseases[:6]


def clean_condition_name(value: str) -> str:
    value = re.sub(r"^\d+[\).]?\s*", "", value or "")
    value = value.strip()
    value = re.sub(r"^(known case of|k/c/o)\s+", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\b(tab|cap|syrup|inj|tablet|capsule|dose|bd|od|tds|sos)\b.*", "", value, flags=re.IGNORECASE)
    value = re.sub(r"[^A-Za-z0-9 +().-]", " ", value)
    value = " ".join(value.split()).strip(" -")

    disease_words = ("asthma", "copd", "pneumonia", "diabetes", "hypertension", "cardiac", "kidney", "stroke")
    if re.search(r"\bfor\s+\d+\s+(days|weeks|months|years)\b", value, flags=re.IGNORECASE) and not any(
        word in value.lower() for word in disease_words
    ):
        return ""

    if len(value) < 3 or len(value) > 70:
        return ""

    return value.title()


def extract_history(text: str) -> str:
    history_patterns = [
        r"(medical history[:\-]?\s*.+?)(?:medications[:\-]|discharge advice[:\-]|doctor[:\-]|date[:\-]|$)",
        r"(history[:\-]?\s*.+?)(?:medications[:\-]|discharge advice[:\-]|doctor[:\-]|date[:\-]|$)",
        r"((?:known case of|k/c/o|past history)[:\-]?\s*.+?)(?:medications[:\-]|rx[:\-]|advice[:\-]|doctor[:\-]|date[:\-]|$)",
    ]

    for pattern in history_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            history_text = " ".join(match.group(1).split())
            return history_text[:220]

    if "previous hospital admission" in text.lower():
        return "Previous hospital admission noted."

    return "Not Found"


def extract_phone(text: str) -> str:
    patterns = [
        r"(?:contact|phone|mobile|patient\s+contact)[:\-]?\s*(\+?\d[\d\s\-()]{8,20}\d)",
        r"\b(\+91[\s\-]?\d{5}[\s\-]?\d{5})\b",
        r"\b(\+?\d{10,15})\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return normalize_phone(match.group(1))

    return ""


def normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", phone)

    if cleaned.startswith("+"):
        return cleaned

    if len(cleaned) == 10:
        return f"+91{cleaned}"

    if cleaned.startswith("91") and len(cleaned) == 12:
        return f"+{cleaned}"

    return cleaned


def extract_medications(lines: list[str]) -> list[str]:
    medications = []
    in_medications_section = False

    for line in lines:
        lower_line = line.lower()
        if any(label in lower_line for label in ("medications", "medicines", "rx", "prescription", "drugs")):
            in_medications_section = True
            inline_value = re.split(r"[:\-]", line, maxsplit=1)
            if len(inline_value) == 2 and inline_value[1].strip():
                medications.extend(split_medication_line(inline_value[1]))
            continue

        if in_medications_section and (
            re.match(r"^[A-Z][A-Z\s]{2,}:?$", line)
            or lower_line.startswith(("advice", "follow", "return", "lifestyle", "allergy", "diagnosis"))
        ):
            break

        likely_prescription_line = bool(
            re.search(r"\b(tab|cap|syrup|inj|tablet|capsule|drops|inhaler|nebul|mg|mcg|units)\b", line, flags=re.IGNORECASE)
        )
        if not in_medications_section and not likely_prescription_line:
            continue

        medications.extend(split_medication_line(line))

    return dedupe_values(medications)[:10]


def split_medication_line(line: str) -> list[str]:
    if line.strip().lower().startswith(("advice", "follow", "return", "lifestyle", "allergy", "diagnosis")):
        return []

    items = re.split(r",|;|\s+\+\s+", line)
    medications = []
    for item in items:
        cleaned = re.sub(r"^\d+[\).]\s*", "", item).strip()
        cleaned = cleaned.split(" - ", 1)[0].strip()
        cleaned = re.sub(r"\s{2,}", " ", cleaned)
        if cleaned and len(cleaned) <= 90:
            medications.append(cleaned)
    return medications


def dedupe_values(values: list[str]) -> list[str]:
    seen = set()
    unique = []
    for value in values:
        key = value.lower()
        if key not in seen:
            unique.append(value)
            seen.add(key)
    return unique


def extract_discharge_date(text: str) -> str:
    match = re.search(
        r"(?:date\s+of\s+discharge|discharge\s+date)[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[-/][A-Za-z]{3,9}[-/][0-9]{4}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})",
        text,
        flags=re.IGNORECASE,
    )

    if match:
        return match.group(1).strip()

    return ""
