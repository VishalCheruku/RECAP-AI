from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import save_event
from patient_policy import resolve_notification_phone, should_call_patient
from voice_call import call_high_risk_patients, call_patient, generate_voice_script


router = APIRouter(prefix="/voice", tags=["Voice Calls"])


class PatientCallRequest(BaseModel):
    name: str
    age: int
    disease: str
    risk_level: str
    risk_score: int
    phone: str
    medical_history: Optional[str] = ""
    discharge_date: Optional[str] = None
    admission_date: Optional[str] = None
    medications: Optional[list] = []
    doctor_name: Optional[str] = "your doctor"
    call_channel: Optional[str] = "phone"


class BulkCallRequest(BaseModel):
    patients: list[PatientCallRequest]


@router.post("/call-patient")
async def call_single_patient(req: PatientCallRequest):
    patient = req.model_dump()
    patient["risk_level"] = patient["risk_level"].upper()
    patient["phone"] = resolve_notification_phone(patient_name=patient["name"])

    if not should_call_patient(patient["risk_level"]):
        return {"status": "skipped", "reason": "LOW risk patients are not called"}

    result = call_patient(patient)
    result["risk"] = patient["risk_level"]
    result["storage"] = save_event("call_logs", result)
    return result


@router.post("/call-all-high-risk")
async def call_all_high_risk(req: BulkCallRequest):
    patients = []
    for request_patient in req.patients:
        patient = request_patient.model_dump()
        patient["risk_level"] = patient["risk_level"].upper()
        patient["phone"] = resolve_notification_phone(patient_name=patient["name"])
        patients.append(patient)

    at_risk = [patient for patient in patients if should_call_patient(patient["risk_level"])]

    if not at_risk:
        return {"status": "no_action", "message": "No HIGH/MEDIUM risk patients found"}

    results = call_high_risk_patients(patients)
    for result in results:
        result["storage"] = save_event("call_logs", result)
    return {
        "status": "calls_completed",
        "total_patients": len(patients),
        "calls_scheduled": len(at_risk),
        "results": results,
        "breakdown": {
            "HIGH": sum(1 for patient in at_risk if patient["risk_level"] == "HIGH"),
            "MEDIUM": sum(1 for patient in at_risk if patient["risk_level"] == "MEDIUM"),
        },
    }


@router.post("/preview-script")
async def preview_script(req: PatientCallRequest):
    try:
        script = generate_voice_script(req.model_dump())
        return {
            "patient": req.name,
            "risk_level": req.risk_level,
            "script": script,
            "word_count": len(script.split()),
            "estimated_duration_seconds": round(len(script.split()) * 0.45, 1),
        }
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
