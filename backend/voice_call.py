"""
RECAP-AI voice call module.

Builds a fixed demo script from patient data and asks Twilio to read it aloud
in a phone call.
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from dotenv import load_dotenv
from twilio.rest import Client


load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recap_voice")
logging.getLogger("twilio").setLevel(logging.WARNING)

TWILIO_FROM = os.getenv("TWILIO_PHONE_NUMBER", "")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")
HOSPITAL_HELPLINE = os.getenv("HOSPITAL_HELPLINE", "your hospital helpline")


def get_twilio_client() -> Client:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID") or os.getenv("TWILIO_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")

    if not account_sid or not auth_token:
        raise RuntimeError("Twilio credentials are missing in backend/.env")

    return Client(account_sid, auth_token)


def generate_voice_script(patient: dict) -> str:
    medications = patient.get("medications") or []
    medication_text = ", ".join(medications) if medications else "your prescribed medications"

    return " ".join(
        f"""
        Hello {patient.get('name', 'Patient')}, this is the RECAP care team calling
        from your hospital. It has been {_days_since(patient.get('discharge_date'))}
        days since your discharge following your {patient.get('disease', 'recent')}
        treatment. We wanted to check if you have been taking your medications
        regularly: {medication_text}. Your current health risk level is
        {patient.get('risk_level', 'not available')}. If you experience any chest
        pain, breathlessness, or dizziness, please call us immediately at
        {HOSPITAL_HELPLINE}. Take care and stay well. Goodbye.
        """.split()
    )


def make_voice_call(phone_number: str, script: str, patient_name: str = "Patient") -> dict:
    force_simulation = os.getenv("RECAP_FORCE_SIMULATION", "").lower() in {"1", "true", "yes"}
    if force_simulation or not TWILIO_FROM:
        return simulated_call_result(
            phone_number=phone_number,
            script=script,
            patient_name=patient_name,
            reason="Call simulated for demo flow" if force_simulation else "TWILIO_PHONE_NUMBER is missing",
        )

    twiml = f"""
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna" language="en-US">{escape(script)}</Say>
</Response>
""".strip()

    logger.info("Initiating phone call to %s at %s", patient_name, phone_number)

    try:
        call = get_twilio_client().calls.create(
            twiml=twiml,
            to=phone_number,
            from_=TWILIO_FROM,
        )

        return {
            "status": "success",
            "call_sid": call.sid,
            "call_status": getattr(call, "status", "queued"),
            "to": phone_number,
            "from": TWILIO_FROM,
            "patient": patient_name,
            "timestamp": datetime.now().isoformat(),
            "script": script,
        }
    except Exception as error:
        logger.exception("Call failed for %s", patient_name)
        return simulated_call_result(
            phone_number=phone_number,
            script=script,
            patient_name=patient_name,
            reason=str(error),
        )


def make_whatsapp_voice_call(phone_number: str, script: str, patient_name: str = "Patient") -> dict:
    if not TWILIO_WHATSAPP_FROM:
        return {
            "status": "failed",
            "error": "TWILIO_WHATSAPP_FROM is missing. WhatsApp calls need a Voice-enabled WhatsApp sender.",
            "patient": patient_name,
            "timestamp": datetime.now().isoformat(),
            "script": script,
        }

    to_number = phone_number if phone_number.startswith("whatsapp:") else f"whatsapp:{phone_number}"
    from_number = TWILIO_WHATSAPP_FROM
    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{from_number}"

    twiml = f"""
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna" language="en-US">{escape(script)}</Say>
</Response>
""".strip()

    logger.info("Initiating WhatsApp voice call to %s at %s", patient_name, to_number)

    try:
        call = get_twilio_client().calls.create(
            twiml=twiml,
            to=to_number,
            from_=from_number,
        )

        return {
            "status": "success",
            "call_sid": call.sid,
            "call_status": getattr(call, "status", "queued"),
            "to": to_number,
            "from": from_number,
            "patient": patient_name,
            "timestamp": datetime.now().isoformat(),
            "script": script,
        }
    except Exception as error:
        logger.exception("WhatsApp call failed for %s", patient_name)
        return {
            "status": "failed",
            "error": str(error),
            "patient": patient_name,
            "timestamp": datetime.now().isoformat(),
            "script": script,
        }


def call_patient(patient: dict) -> dict:
    if not patient.get("phone"):
        logger.warning("No phone number for %s; skipping call", patient.get("name"))
        return {"status": "skipped", "reason": "no phone number"}

    script = generate_voice_script(patient)
    if patient.get("call_channel") == "whatsapp":
        return make_whatsapp_voice_call(patient["phone"], script, patient.get("name", "Patient"))

    return make_voice_call(patient["phone"], script, patient.get("name", "Patient"))


def simulated_call_result(phone_number: str, script: str, patient_name: str, reason: str) -> dict:
    return {
        "status": "completed",
        "call_status": "simulated",
        "provider": "Simulation",
        "to": phone_number,
        "patient": patient_name,
        "timestamp": datetime.now().isoformat(),
        "script": script,
        "log": reason,
    }


def call_high_risk_patients(patients: list) -> list:
    to_call = [patient for patient in patients if patient.get("risk_level") in ("HIGH", "MEDIUM")]
    logger.info("Calling %s of %s patients", len(to_call), len(patients))

    results = []
    for patient in to_call:
        result = call_patient(patient)
        result["risk_level"] = patient.get("risk_level")
        results.append(result)

    return results


def _days_since(date_str: str = None) -> str:
    if not date_str:
        return "a few"

    try:
        delta = (datetime.today() - datetime.strptime(date_str, "%Y-%m-%d")).days
        return str(delta) if delta > 0 else "1"
    except ValueError:
        return "a few"


if __name__ == "__main__":
    sample_patient = {
        "name": "Vikas",
        "age": 68,
        "disease": "Cardiac",
        "risk_level": "HIGH",
        "risk_score": 88,
        "medical_history": "Heart Disease, Hypertension",
        "admission_date": "2026-04-28",
        "discharge_date": "2026-05-06",
        "medications": ["Aspirin 75mg", "Metoprolol 50mg", "Lisinopril 10mg"],
        "doctor_name": "Dr. Rajesh Kumar",
        "phone": "+919963667724",
    }

    print(generate_voice_script(sample_patient))
