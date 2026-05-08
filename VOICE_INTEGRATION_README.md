# RECAP-AI Voice Call Integration

## Overview

RECAP-AI now has **AI-powered voice calls** that automatically call high-risk patients with personalized wellness messages.

### The Flow

```
Patient Analysis
      ↓
Risk Assessment (HIGH/MEDIUM)
      ↓
Claude API (generates warm voice script)
      ↓
Twilio (dials patient + reads script with AI voice)
      ↓
Patient receives call from "RECAP Care Team"
```

---

## ✅ What's Installed

| Component | Status | Details |
|-----------|--------|---------|
| **Anthropic API** | ✅ Ready | Claude 3.5 Sonnet generates nurse-like scripts |
| **Twilio** | ✅ Ready | Places actual phone calls with TTS |
| **Python-dotenv** | ✅ Ready | Loads credentials from .env file |
| **.env File** | ✅ Configured | All credentials pre-filled |
| **Voice Routes** | ✅ Integrated | 3 new FastAPI endpoints added |

---

## 📱 New API Endpoints

All endpoints are prefixed with `/voice`

### 1. **Call Single Patient**
```bash
POST /voice/call-patient
Content-Type: application/json

{
  "name": "Ramesh Kumar",
  "age": 72,
  "disease": "Cardiac",
  "risk_level": "HIGH",
  "risk_score": 85,
  "phone": "+919963667724",
  "medical_history": "Hypertension, Diabetes",
  "discharge_date": "2025-05-02",
  "medications": ["Metoprolol 25mg", "Aspirin 75mg"],
  "doctor_name": "Dr. Priya Sharma"
}
```

**Response:**
```json
{
  "status": "call_initiated",
  "patient": "Ramesh Kumar",
  "risk": "HIGH",
  "message": "Calling Ramesh Kumar at +919963667724 shortly"
}
```

---

### 2. **Call All High/Medium Risk Patients (Bulk)**
```bash
POST /voice/call-all-high-risk
Content-Type: application/json

{
  "patients": [
    { patient1 object },
    { patient2 object },
    { patient3 object }
  ]
}
```

**Response:**
```json
{
  "status": "calls_initiated",
  "total_patients": 120,
  "calls_scheduled": 15,
  "breakdown": {
    "HIGH": 8,
    "MEDIUM": 7
  }
}
```

---

### 3. **Preview Script (No Call)**
```bash
POST /voice/preview-script
Content-Type: application/json

{
  "name": "Ramesh Kumar",
  "age": 72,
  "disease": "Cardiac",
  "risk_level": "HIGH",
  "risk_score": 85,
  "phone": "+919963667724",
  "medical_history": "Hypertension, Diabetes",
  "discharge_date": "2025-05-02",
  "medications": ["Metoprolol 25mg"],
  "doctor_name": "Dr. Priya Sharma"
}
```

**Response:**
```json
{
  "patient": "Ramesh Kumar",
  "risk_level": "HIGH",
  "script": "Hello Ramesh, this is the RECAP care team calling from the hospital...",
  "word_count": 118,
  "estimated_duration_seconds": 53.1
}
```

---

## 🔧 How It Works

### Step 1: Patient Data Enters System
Your existing dashboard analysis produces a patient dict:
```python
patient = {
    "name": "Ramesh Kumar",
    "age": 72,
    "disease": "Cardiac",
    "risk_level": "HIGH",
    "risk_score": 85,
    "phone": "+919963667724"  # ← NEW field
}
```

### Step 2: Claude Generates Script
The `generate_voice_script()` function:
- Sends patient data + medical history to Claude
- Claude returns warm, nurse-like spoken English
- Script includes: greeting, condition reference, medication check, health tip, emergency number

**Example Output:**
```
"Hello Ramesh, this is the RECAP care team calling from the hospital. 
It's been 3 days since you were discharged after your cardiac episode. 
How are you feeling today? I wanted to check in on your medications - 
have you been taking your Metoprolol and Aspirin regularly? 
It's very important to take these exactly as prescribed to protect your heart. 
If you experience any chest pain, shortness of breath, or dizziness, 
please call +91 99636 67724 immediately. We're here for you, Ramesh."
```

### Step 3: Twilio Makes Call
The `make_voice_call()` function:
- Converts script to TwiML (Twilio's XML format)
- Uses **Amazon Polly.Joanna** voice (warm, clear American English)
- Dials the patient's phone number
- Reads script aloud at natural speaking pace
- Offers options: press 1 to repeat, press 2 to speak to care team

### Step 4: Logging & Follow-up
- Call SID saved for tracking
- Result includes: success/failure, timestamp, script used
- Can trigger follow-up based on patient response

---

## 🎛️ Configuration

### Backend .env File (Already Set)
```
ANTHROPIC_API_KEY=sk-ant-api03-Brqz...
TWILIO_ACCOUNT_SID=ACdc7b39f5d7c...
TWILIO_AUTH_TOKEN=8134f6802dfc...
TWILIO_PHONE_NUMBER=+14055262574
HOSPITAL_HELPLINE=+919963667724
```

### Frontend .env File (Ports Configured)
```
PORT=4000
REACT_APP_API_URL=http://127.0.0.1:8000
```

### Important Notes
- **Twilio Trial**: Only calls numbers you've verified
- Your verified number: `+919963667724`
- To test: Set patient `phone` to your number
- Production: Purchase Twilio credits to call any number

---

## 🧪 Testing

### Test 1: Preview Script (No Call)
```bash
curl -X POST http://localhost:8000/voice/preview-script \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ramesh Kumar",
    "age": 72,
    "disease": "Cardiac",
    "risk_level": "HIGH",
    "risk_score": 85,
    "phone": "+919963667724",
    "medical_history": "Hypertension",
    "discharge_date": "2025-05-02",
    "medications": ["Metoprolol 25mg"],
    "doctor_name": "Dr. Priya"
  }'
```

### Test 2: Make Actual Call
Same as Test 1, but use `/voice/call-patient` endpoint.
**Your phone will ring in ~5 seconds.**

### Test 3: Bulk Call (All At-Risk)
```bash
curl -X POST http://localhost:8000/voice/call-all-high-risk \
  -H "Content-Type: application/json" \
  -d '{
    "patients": [
      { patient1 },
      { patient2 },
      { patient3 }
    ]
  }'
```

---

## 📊 Backend & Frontend Ports (Fixed)

| Service | Port | URL | Status |
|---------|------|-----|--------|
| **FastAPI Backend** | 8000 | http://127.0.0.1:8000 | ✅ Always 8000 |
| **React Frontend** | 4000 | http://localhost:4000 | ✅ Always 4000 |

### Start Commands
```bash
# Terminal 1: Backend
cd 'c:\VS Code\New folder\recap-ai\backend'
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2: Frontend
cd 'c:\VS Code\New folder\recap-ai\frontend'
npm start
```

**Ports are hardcoded and configured via:**
- Backend: `--port 8000` in uvicorn command
- Frontend: `PORT=4000` in `frontend/.env` (auto-loads)

---

## 📁 Files Added/Modified

### New Files
- `backend/voice_call.py` - Core voice logic (Claude + Twilio)
- `backend/voice_routes.py` - FastAPI endpoints

### Modified Files
- `backend/main.py` - Added voice router import + registration
- `backend/.env` - Added Claude & Twilio credentials
- `backend/requirements.txt` - Added anthropic, twilio, python-dotenv

---

## 🚀 Integration with Dashboard

### Option 1: Add Voice Button to Dashboard
In your React component, add a button that calls the `/voice/call-patient` endpoint:

```javascript
const handleVoiceCall = async () => {
  const response = await fetch('http://127.0.0.1:8000/voice/call-patient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...patientData,
      phone: "+919963667724"  // Add phone to patient data
    })
  });
  const result = await response.json();
  console.log("Call initiated:", result);
};
```

### Option 2: Preview Before Calling
```javascript
const handlePreviewScript = async () => {
  const response = await fetch('http://127.0.0.1:8000/voice/preview-script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patientData)
  });
  const result = await response.json();
  console.log("Script:", result.script);
  console.log("Duration:", result.estimated_duration_seconds, "seconds");
};
```

---

## ⚠️ Twilio Trial Limitations

- ✅ Can call verified numbers
- ❌ Cannot call random numbers
- Your verified number: `+919963667724`

### To Upgrade (Production)
1. Remove trial restriction
2. Purchase Twilio credits ($15-50 starter pack)
3. Can then call any number in 180+ countries
4. Cost: ~$0.02-0.15 per call

---

## 🔐 Security Notes

1. **API Keys in .env**: Never commit `.env` to git
2. **Phone Numbers**: Patient `phone` field is required
3. **Rate Limiting**: Twilio API has rate limits (check docs)
4. **HIPAA**: If storing call recordings, ensure HIPAA compliance

---

## 📊 Demo Flow for Investor Pitch

1. **Show Dashboard**: Patient "Ramesh Kumar" flagged HIGH risk
2. **Click "📞 Call Patient"** button
3. Your phone rings ~5 seconds later
4. Hear: *"Hello Ramesh, this is the RECAP care team calling..."* (AI voice)
5. Script shows on screen simultaneously
6. Total wow factor: **30 seconds**

---

## 🐛 Troubleshooting

### Error: "No module named 'anthropic'"
```bash
pip install anthropic
```

### Error: "No module named 'twilio'"
```bash
pip install twilio
```

### Error: "ANTHROPIC_API_KEY not set"
- Check `.env` file exists in `backend/` directory
- Verify API key is correct
- Restart FastAPI server

### Error: "Call failed: Unverified number"
- Twilio trial can only call verified numbers
- Verify your phone number in Twilio console first

### No Sound on Call
- Check Twilio account has credits
- Verify phone number is correct format
- Try TwiML inspector in Twilio console

---

## 📞 Support

| Issue | Solution |
|-------|----------|
| Calls not working | Check Twilio credentials in .env |
| Script too long | Claude limits to 120 words naturally |
| Wrong voice | Amazon Polly.Joanna is hardcoded (best for healthcare) |
| Missed calls | Increase timeout in voice_call.py |

---

## ✨ What's Next

1. Add voice call button to React Dashboard
2. Store call recordings & outcomes
3. Add callback handling (user presses button 2)
4. Integrate with SMS follow-ups
5. A/B test different script styles

---

**Backend Ready**: Port 8000 ✅  
**Frontend Ready**: Port 4000 ✅  
**Voice Calls Ready**: Claude + Twilio ✅  

Test it now: `http://localhost:4000`
