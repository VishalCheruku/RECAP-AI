import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from database import list_recent, mongo_status, save_event, seed_demo_data
from ocr_processor import extract_document_text, parse_patient_data
from patient_policy import resolve_notification_phone, should_call_patient
from risk_model import calculate_risk, calculate_risk_from_inputs
from voice_routes import router as voice_router


app = FastAPI(title="RECAP AI")
sms_logs = []
medication_reply_logs = []
family_alert_logs = []
doctor_alert_logs = []
pending_reply_watch = []
whatsapp_logs = []


class ManualRiskInput(BaseModel):
    name: str = "Not Provided"
    age: int = 0
    disease: str = "Not Found"
    prior_admission: bool = False


class SmsAlertInput(BaseModel):
    patient_name: str = "Patient"
    phone_number: str = ""
    message: str


class MedicationReplyInput(BaseModel):
    patient_name: str = "Patient"
    phone_number: str = ""
    reply: str


class FamilyAlertInput(BaseModel):
    patient_name: str = "Patient"
    family_contact: str = ""
    message: str
    risk_level: str = "LOW"


class DoctorAlertInput(BaseModel):
    patient_name: str = "Patient"
    reason: str
    risk_level: str = "LOW"


class WhatsAppAlertInput(BaseModel):
    patient_name: str = "Patient"
    phone_number: str = ""
    message: str


def load_local_env() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_local_env()

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_SID", "") or os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE", "") or os.getenv("TWILIO_PHONE_NUMBER", "")
DOCTOR_PHONE_NUMBER = os.getenv("DOCTOR_PHONE_NUMBER", "")


def create_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include voice call routes
app.include_router(voice_router)


@app.get("/")
def home():
    return {"message": "RECAP AI Backend Running"}


@app.on_event("startup")
def seed_panel_demo_data():
    seed_result = seed_demo_data()
    print("MongoDB demo seed:", seed_result)


@app.get("/demo-data")
async def get_demo_data():
    return {
        "mongo": mongo_status(),
        "patients": list_recent("demo_patients", limit=20),
        "events": list_recent("demo_events", limit=20),
        "reports": list_recent("reports", limit=10),
    }


@app.post("/upload-document")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is missing.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        extracted_text = extract_document_text(file.filename, file_bytes)
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    print("OCR Preview:", " ".join(extracted_text.split())[:500])

    patient_data = parse_patient_data(extracted_text)
    risk_level, risk_score, risk_factors = calculate_risk(extracted_text, patient_data)
    notification_phone = resolve_notification_phone(
        patient_name=patient_data["name"],
        extracted_text=extracted_text,
    )
    patient_data["phone"] = notification_phone
    analysis_timestamp = create_timestamp()
    automation = run_automatic_monitoring_flow(
        patient_name=patient_data["name"],
        risk_level=risk_level,
        patient_phone=notification_phone,
    )

    report = {
        "name": patient_data["name"],
        "age": patient_data["age"],
        "disease": patient_data["disease"],
        "history": patient_data["history"],
        "phone": notification_phone,
        "medications": patient_data.get("medications", []),
        "discharge_date": patient_data.get("discharge_date", ""),
        "risk_level": risk_level,
        "risk_score": risk_score,
        "risk_factors": risk_factors,
        "occurred_at": analysis_timestamp,
        "ocr_completed_at": analysis_timestamp,
        "risk_evaluated_at": analysis_timestamp,
        "automation": automation,
    }
    report["storage"] = save_event("reports", report)
    return report


@app.post("/predict-risk")
async def predict_risk(payload: ManualRiskInput):
    patient_data = {
        "name": payload.name.strip() or "Not Provided",
        "age": payload.age,
        "disease": payload.disease.strip() or "Not Found",
        "prior_admission": payload.prior_admission,
    }
    risk_level, risk_score, risk_factors = calculate_risk_from_inputs(patient_data)
    analysis_timestamp = create_timestamp()
    notification_phone = resolve_notification_phone(patient_name=patient_data["name"])
    automation = run_automatic_monitoring_flow(
        patient_name=patient_data["name"],
        risk_level=risk_level,
        patient_phone=notification_phone,
    )

    report = {
        "name": patient_data["name"],
        "age": patient_data["age"],
        "disease": patient_data["disease"],
        "history": "Manual entry",
        "phone": notification_phone,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "risk_factors": risk_factors,
        "occurred_at": analysis_timestamp,
        "risk_evaluated_at": analysis_timestamp,
        "automation": automation,
    }
    report["storage"] = save_event("reports", report)
    return report


@app.post("/send-sms-alert")
async def send_sms_alert(payload: SmsAlertInput):
    message = payload.message.strip()
    sms_delivery = send_sms(
        phone=payload.phone_number.strip(),
        message=message,
    )
    sms_entry = {
        "patient_name": payload.patient_name.strip() or "Patient",
        "phone_number": payload.phone_number.strip() or "Not Provided",
        "message": message,
        "status": "SMS Sent",
        "occurred_at": create_timestamp(),
        "provider": sms_delivery["provider"],
        "delivery_log": sms_delivery["log"],
    }
    if sms_delivery["provider_sid"]:
        sms_entry["provider_sid"] = sms_delivery["provider_sid"]
    sms_logs.insert(0, sms_entry)
    del sms_logs[8:]
    sms_entry["storage"] = save_event("sms_logs", sms_entry)
    register_pending_reply(
        patient_name=sms_entry["patient_name"],
        phone_number=sms_entry["phone_number"],
        message=message,
    )
    return sms_entry


@app.post("/send-whatsapp-alert")
async def send_whatsapp_alert(payload: WhatsAppAlertInput):
    message = payload.message.strip()
    provider_sid = send_twilio_message(
        to_number=payload.phone_number.strip(),
        message=message,
        channel="whatsapp",
    )
    whatsapp_entry = {
        "patient_name": payload.patient_name.strip() or "Patient",
        "phone_number": payload.phone_number.strip() or "Not Provided",
        "message": message,
        "status": "WhatsApp Sent",
        "occurred_at": create_timestamp(),
        "provider": "Twilio",
        "provider_sid": provider_sid,
    }
    whatsapp_logs.insert(0, whatsapp_entry)
    del whatsapp_logs[8:]
    whatsapp_entry["storage"] = save_event("whatsapp_logs", whatsapp_entry)
    register_pending_reply(
        patient_name=whatsapp_entry["patient_name"],
        phone_number=whatsapp_entry["phone_number"],
        message=message,
    )
    return whatsapp_entry


@app.get("/whatsapp-alerts")
async def get_whatsapp_alerts():
    return {"alerts": whatsapp_logs}


@app.get("/sms-alerts")
async def get_sms_alerts():
    return {"alerts": sms_logs}


@app.post("/send-family-alert")
async def send_family_alert(payload: FamilyAlertInput):
    normalized_risk = payload.risk_level.strip().upper() or "LOW"
    default_message = build_family_alert_message(normalized_risk)
    message = payload.message.strip() or default_message
    delivery = send_sms(
        phone=payload.family_contact.strip(),
        message=message,
    )
    family_entry = {
        "patient_name": payload.patient_name.strip() or "Patient",
        "family_contact": payload.family_contact.strip() or "Not Provided",
        "message": message,
        "risk_level": normalized_risk,
        "status": "Alert Sent To Family",
        "occurred_at": create_timestamp(),
        "provider": delivery["provider"],
        "delivery_log": delivery["log"],
    }
    if delivery["provider_sid"]:
        family_entry["provider_sid"] = delivery["provider_sid"]
    family_alert_logs.insert(0, family_entry)
    del family_alert_logs[8:]
    family_entry["storage"] = save_event("family_alerts", family_entry)
    return family_entry


@app.get("/family-alerts")
async def get_family_alerts():
    return {"alerts": family_alert_logs}


@app.post("/send-doctor-alert")
async def send_doctor_alert(payload: DoctorAlertInput):
    normalized_risk = payload.risk_level.strip().upper() or "LOW"
    return create_doctor_alert(
        patient_name=payload.patient_name.strip() or "Patient",
        reason=payload.reason.strip(),
        risk_level=normalized_risk,
    )


@app.get("/doctor-alerts")
async def get_doctor_alerts():
    return {"alerts": doctor_alert_logs}


@app.post("/record-medication-reply")
async def record_medication_reply(payload: MedicationReplyInput):
    return process_medication_reply(
        patient_name=payload.patient_name.strip() or "Patient",
        phone_number=payload.phone_number.strip() or "Not Provided",
        reply=payload.reply,
    )


@app.get("/medication-replies")
async def get_medication_replies():
    return {"replies": medication_reply_logs}


@app.post("/twilio/incoming-sms")
async def twilio_incoming_sms(
    From: str = Form(...),
    Body: str = Form(...),
    ProfileName: str = Form(default="Patient"),
):
    reply_entry = process_medication_reply(
        patient_name=ProfileName.strip() or "Patient",
        phone_number=From.strip(),
        reply=Body.strip(),
    )
    reply_message = build_patient_followup_message(reply_entry)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{escape_xml(reply_message)}</Message>
</Response>"""
    return Response(content=twiml, media_type="application/xml")


@app.post("/twilio/incoming-whatsapp")
async def twilio_incoming_whatsapp(
    From: str = Form(...),
    Body: str = Form(...),
    ProfileName: str = Form(default="Patient"),
):
    reply_entry = process_medication_reply(
        patient_name=ProfileName.strip() or "Patient",
        phone_number=From.replace("whatsapp:", "").strip(),
        reply=Body.strip(),
    )
    reply_message = build_patient_followup_message(reply_entry)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{escape_xml(reply_message)}</Message>
</Response>"""
    return Response(content=twiml, media_type="application/xml")


def build_family_alert_message(risk_level: str) -> str:
    if risk_level == "HIGH":
        return "Alert sent to family: High-risk patient needs urgent support for medicines and follow-up."
    if risk_level == "MEDIUM":
        return "Alert sent to family: Patient may need help with medicines and follow-up care."
    return "Alert sent to family: Please support the patient with medicines and routine follow-up."


def build_monitoring_message(risk_level: str) -> str:
    if risk_level == "HIGH":
        return "High-risk alert: Please take your medicines, monitor symptoms, and contact your doctor today."
    if risk_level == "MEDIUM":
        return "Reminder: Take your medication and attend your follow-up visit on time."
    return "Take your medication on time today."


def run_automatic_monitoring_flow(patient_name: str, risk_level: str, patient_phone: str = "") -> dict:
    normalized_name = patient_name or "Patient"
    normalized_risk = (risk_level or "LOW").strip().upper()
    normalized_phone = patient_phone.strip() or resolve_notification_phone(patient_name=normalized_name)
    monitoring_entry = {
        "patient_name": normalized_name,
        "phone_number": normalized_phone,
        "message": build_monitoring_message(normalized_risk),
        "status": "Message Relayed Through SMS",
        "occurred_at": create_timestamp(),
        "provider": "System Automation",
    }

    sms_delivery = send_sms(
        phone=normalized_phone,
        message=monitoring_entry["message"],
    )
    monitoring_entry["delivery_log"] = sms_delivery["log"]
    monitoring_entry["provider"] = sms_delivery["provider"]
    if sms_delivery["provider_sid"]:
        monitoring_entry["provider_sid"] = sms_delivery["provider_sid"]

    sms_logs.insert(0, monitoring_entry)
    del sms_logs[8:]
    monitoring_entry["storage"] = save_event("sms_logs", monitoring_entry)

    automation = {
        "monitoring_started": True,
        "monitoring_message": "Message relayed through SMS",
        "monitoring_entry": monitoring_entry,
        "notification_phone": normalized_phone,
        "sms_sent": True,
        "call_required": should_call_patient(normalized_risk),
        "call_status": "pending" if should_call_patient(normalized_risk) else "not_required",
        "doctor_alert_triggered": False,
    }

    if normalized_risk == "HIGH":
        automation["doctor_alert_triggered"] = True
        automation["doctor_alert"] = create_doctor_alert(
            patient_name=normalized_name,
            reason="High discharge risk",
            risk_level=normalized_risk,
        )
        automation["monitoring_message"] = "Message relayed through SMS; call pending"
    elif automation["call_required"]:
        automation["monitoring_message"] = "Message relayed through SMS; call pending"

    return automation


def create_doctor_alert(patient_name: str, reason: str, risk_level: str):
    alert_entry = {
        "patient_name": patient_name,
        "reason": reason,
        "risk_level": risk_level,
        "message": f"Doctor alert: {patient_name} requires review due to {reason.lower()}.",
        "status": "Doctor Alert Sent",
        "occurred_at": create_timestamp(),
    }

    sms_delivery = send_sms(
        phone=DOCTOR_PHONE_NUMBER,
        message=alert_entry["message"],
    )
    alert_entry["provider"] = sms_delivery["provider"]
    alert_entry["delivery_log"] = sms_delivery["log"]
    if sms_delivery["provider_sid"]:
        alert_entry["provider_sid"] = sms_delivery["provider_sid"]

    doctor_alert_logs.insert(0, alert_entry)
    del doctor_alert_logs[8:]
    alert_entry["storage"] = save_event("doctor_alerts", alert_entry)

    sms_logs.insert(
        0,
        {
            "patient_name": patient_name,
            "phone_number": "Clinical Team",
            "message": alert_entry["message"],
            "status": "Doctor Alert Sent",
            "occurred_at": alert_entry["occurred_at"],
        },
    )
    del sms_logs[8:]

    return alert_entry


def process_medication_reply(patient_name: str, phone_number: str, reply: str):
    normalized_reply = normalize_reply(reply)
    if normalized_reply not in {"YES", "NO", "NO_RESPONSE"}:
        raise HTTPException(status_code=400, detail="Reply must be YES, NO, or NO_RESPONSE.")

    patient_replies = [
        entry for entry in medication_reply_logs if entry["patient_name"] == patient_name
    ]
    recent_no_count = 0
    recent_no_response_count = 0

    for entry in reversed(patient_replies):
        if entry["reply"] == "NO":
            recent_no_count += 1
        elif entry["reply"] == "NO_RESPONSE":
            recent_no_response_count += 1
        else:
            break

    if normalized_reply == "NO":
        recent_no_count += 1
        recent_no_response_count = 0
    elif normalized_reply == "NO_RESPONSE":
        recent_no_response_count += 1
        recent_no_count = 0
    else:
        recent_no_count = 0
        recent_no_response_count = 0

    missed_meds_alert = recent_no_count >= 2
    no_response_alert = recent_no_response_count >= 1
    alert_triggered = missed_meds_alert or no_response_alert

    reply_entry = {
        "patient_name": patient_name,
        "phone_number": phone_number,
        "reply": normalized_reply,
        "missed_count": recent_no_count,
        "no_response_count": recent_no_response_count,
        "alert_triggered": alert_triggered,
        "status": "Alert Triggered" if alert_triggered else "Reply Recorded",
        "occurred_at": create_timestamp(),
    }

    medication_reply_logs.insert(0, reply_entry)
    del medication_reply_logs[12:]
    clear_pending_reply(phone_number)
    reply_entry["storage"] = save_event("medication_replies", reply_entry)

    if missed_meds_alert:
        create_doctor_alert(
            patient_name=patient_name,
            reason="Repeated missed medication responses",
            risk_level="MEDIUM",
        )
        family_alert_logs.insert(
            0,
            {
                "patient_name": patient_name,
                "family_contact": "Saved Family Contact",
                "message": "Alert sent to family: Patient missed meds repeatedly after discharge.",
                "risk_level": "MEDIUM",
                "status": "Alert Sent To Family",
                "occurred_at": create_timestamp(),
            },
        )
        del family_alert_logs[8:]

    if no_response_alert:
        create_doctor_alert(
            patient_name=patient_name,
            reason="No response to medication reminder",
            risk_level="HIGH",
        )

    return reply_entry


def normalize_reply(reply: str) -> str:
    normalized = reply.strip().upper()
    if normalized in {"YES", "Y"}:
        return "YES"
    if normalized in {"NO", "N"}:
        return "NO"
    if normalized in {"NO_RESPONSE", "NO RESPONSE"}:
        return "NO_RESPONSE"
    return normalized


def build_patient_followup_message(reply_entry: dict) -> str:
    if reply_entry["reply"] == "YES":
        return "Thank you. Your response is recorded. Please continue your medicines and follow-up care."
    if reply_entry["reply"] == "NO":
        if reply_entry["alert_triggered"]:
            return "We noticed repeated missed medication responses. Our care team has been alerted to support you."
        return "Please take your medicines as prescribed. Reply YES once you have taken them."
    return "We did not receive a valid medication confirmation. Our care team may follow up with you."


def register_pending_reply(patient_name: str, phone_number: str, message: str) -> None:
    if "reply yes or no" not in message.lower():
        return

    pending_reply_watch.insert(
        0,
        {
            "patient_name": patient_name,
            "phone_number": phone_number,
            "message": message,
            "status": "Waiting For Reply",
            "occurred_at": create_timestamp(),
        },
    )
    del pending_reply_watch[12:]


def clear_pending_reply(phone_number: str) -> None:
    for entry in pending_reply_watch:
        if entry["phone_number"] == phone_number and entry["status"] == "Waiting For Reply":
            entry["status"] = "Reply Received"
            break


def escape_xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def send_sms(phone: str, message: str) -> dict:
    normalized_phone = phone.strip()
    force_simulation = os.getenv("RECAP_FORCE_SIMULATION", "").lower() in {"1", "true", "yes"}
    if not force_simulation and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER and normalized_phone:
        try:
            provider_sid = send_twilio_sms(
                to_number=normalized_phone,
                message=message,
            )
            log_message = "Real SMS sent"
            print(log_message)
            return {
                "provider": "Twilio",
                "provider_sid": provider_sid,
                "log": log_message,
            }
        except HTTPException:
            # Trial accounts can only send to verified recipients, so fall back silently to simulation.
            pass

    log_message = "Simulated SMS used"
    print(log_message)
    return {
        "provider": "Simulation",
        "provider_sid": "",
        "log": log_message,
    }


def send_twilio_sms(to_number: str, message: str) -> str:
    return send_twilio_message(to_number=to_number, message=message, channel="sms")


def send_twilio_message(to_number: str, message: str, channel: str = "sms") -> str:
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_PHONE_NUMBER:
        raise HTTPException(status_code=500, detail="Twilio credentials are missing.")

    if not to_number:
        raise HTTPException(status_code=400, detail="Recipient phone number is required.")

    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    from_number = TWILIO_PHONE_NUMBER
    target_number = to_number
    if channel == "whatsapp":
        from_number = f"whatsapp:{TWILIO_PHONE_NUMBER}"
        target_number = to_number if to_number.startswith("whatsapp:") else f"whatsapp:{to_number}"

    response = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
        auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        data={
            "From": from_number,
            "To": target_number,
            "Body": message,
        },
        timeout=20,
    )

    if response.status_code >= 400:
        try:
            error_detail = response.json().get("message", "Twilio request failed.")
        except ValueError:
            error_detail = "Twilio request failed."
        raise HTTPException(status_code=400, detail=error_detail)

    return response.json().get("sid", "")
