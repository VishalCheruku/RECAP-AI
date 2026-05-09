import React, { useState } from "react";
import Upload from "./components/Upload";
import Dashboard from "./components/Dashboard";
import ManualEntry from "./components/ManualEntry";
import SmsMonitor from "./components/SmsMonitor";
import FamilyAlert from "./components/FamilyAlert";
import DoctorAlert from "./components/DoctorAlert";
import HighRiskPopup from "./components/HighRiskPopup";
import SystemStatus from "./components/SystemStatus";
import { createTimestamp, ensureTimestamp } from "./utils/time";
import { buildApiUrl } from "./utils/api";

const DEFAULT_PATIENTS = [
  {
    name: "Asha Devi",
    age: 72,
    disease: "Hypertension, Cardiac",
    risk_level: "HIGH",
    risk_score: 92,
    phone: "+91996667724",
  },
  {
    name: "Ravi Kumar",
    age: 54,
    disease: "Diabetes",
    risk_level: "MEDIUM",
    risk_score: 58,
    phone: "+91996667724",
  },
  {
    name: "Meena Joseph",
    age: 34,
    disease: "Asthma",
    risk_level: "HIGH",
    risk_score: 84,
    phone: "+91996667724",
  },
  {
    name: "Vikram Singh",
    age: 68,
    disease: "COPD",
    risk_level: "LOW",
    risk_score: 18,
    phone: "+91996667724",
  },
  {
    name: "Surya",
    age: 25,
    disease: "Cardiac",
    risk_level: "HIGH",
    risk_score: 88,
    phone: "+917013864843",
  },
  {
    name: "Vikas",
    age: 68,
    disease: "Cardiac",
    risk_level: "HIGH",
    risk_score: 90,
    phone: "+91996667724",
    medical_history: "Heart Disease, Hypertension",
    discharge_date: "2026-05-06",
    medications: ["Aspirin 75mg", "Metoprolol 50mg", "Lisinopril 10mg"],
    doctor_name: "Dr. Rajesh Kumar",
    admission_date: "2026-04-28",
  },
];

function readStoredJson(key, fallbackValue) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function App() {
  const [result, setResult] = useState(null);
  const [automation, setAutomation] = useState(null);
  const [showHighRiskPopup, setShowHighRiskPopup] = useState(false);
  const [lastAction, setLastAction] = useState(() => readStoredJson("recap_last_action", "Waiting for analysis"));
  const [monitoringState, setMonitoringState] = useState(() =>
    readStoredJson("recap_monitoring_state", {
      adherence: 0,
      totalInteractions: 0,
      yesResponses: 0,
      escalationLevel: "none",
    }),
  );
  const [patients, setPatients] = useState(() => readStoredJson("recap_patients", DEFAULT_PATIENTS));
  const [patientCount, setPatientCount] = useState(() => readStoredJson("recap_patient_count", 120));
  const [avgCost, setAvgCost] = useState(() => readStoredJson("recap_avg_cost", 15000));
  const [mode, setMode] = useState(() => readStoredJson("recap_mode", "upload"));
  const [activePanel, setActivePanel] = useState(() => readStoredJson("recap_active_panel", "monitoring"));

  const estimatedSavings = Math.round(patientCount * avgCost * 0.15);
  const highCount = patients.filter((patient) => patient.risk_level === "HIGH").length;
  const mediumCount = patients.filter((patient) => patient.risk_level === "MEDIUM").length;
  const lowCount = patients.filter((patient) => patient.risk_level === "LOW").length;

  const triggerVoiceCall = async (patientData) => {
    const riskLevel = (patientData.risk_level || "LOW").toUpperCase();
    if (!["HIGH", "MEDIUM"].includes(riskLevel)) {
      return;
    }

    const phone = patientData.phone || patientData.automation?.notification_phone || "+91996667724";
    const inProgressMessage = `Call is in progress for ${patientData.name || "Patient"} (${formatPhone(phone)})`;
    setLastAction(inProgressMessage);
    window.localStorage.setItem("recap_last_action", JSON.stringify(inProgressMessage));
    setAutomation((current) => ({
      ...(current || {}),
      call_status: "in_progress",
    }));

    try {
      const callData = {
        name: patientData.name || "Patient",
        age: patientData.age || 0,
        disease: patientData.disease || "Not Found",
        risk_level: riskLevel,
        risk_score: patientData.risk_score || 0,
        phone,
        medical_history: patientData.history || patientData.disease || "Not Found",
        discharge_date: patientData.discharge_date || new Date().toISOString().split("T")[0],
        medications: patientData.medications?.length ? patientData.medications : ["Prescribed medications"],
        doctor_name: "Dr. Rajesh Kumar",
        admission_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      };

      const response = await fetch(buildApiUrl("/voice/call-patient"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callData),
      });

      const callResult = await response.json();
      const completed = response.ok && callResult.status !== "skipped";
      const finalMessage = completed
        ? `Message relayed through SMS and call for ${patientData.name || "Patient"}`
        : `Message relayed through SMS; call not required for ${patientData.name || "Patient"}`;

      setAutomation((current) => ({
        ...(current || {}),
        call_status: completed ? "completed" : "not_required",
        call_result: callResult,
      }));
      setLastAction(finalMessage);
      window.localStorage.setItem("recap_last_action", JSON.stringify(finalMessage));
    } catch (error) {
      console.error("Call error:", error);
      const fallbackMessage = `Message relayed through SMS; call could not complete for ${patientData.name || "Patient"}`;
      setAutomation((current) => ({
        ...(current || {}),
        call_status: "failed",
      }));
      setLastAction(fallbackMessage);
      window.localStorage.setItem("recap_last_action", JSON.stringify(fallbackMessage));
    }
  };

  const handleResult = (data) => {
    const normalizedResult = normalizeResult(data);
    const normalizedAutomation = normalizeAutomation(data.automation || null);

    setResult(normalizedResult);
    window.localStorage.setItem("recap_result", JSON.stringify(normalizedResult));
    setAutomation(normalizedAutomation);
    window.localStorage.setItem("recap_automation", JSON.stringify(normalizedAutomation));
    setShowHighRiskPopup(normalizedResult.risk_level === "HIGH");

    const callRequired = normalizedAutomation?.call_required || ["HIGH", "MEDIUM"].includes(normalizedResult.risk_level);
    if (callRequired) {
      setTimeout(() => triggerVoiceCall(normalizedResult), 900);
    }

    const nextAction = callRequired
      ? "Message relayed through SMS; call pending"
      : "Message relayed through SMS";
    setLastAction(nextAction);
    window.localStorage.setItem("recap_last_action", JSON.stringify(nextAction));

    if (normalizedAutomation?.monitoring_entry) {
      const storedSmsLog = readStoredJson("recap_sms_log", []);
      const monitoringAlreadyTracked = storedSmsLog.some(
        (entry) =>
          entry.patient_name === normalizedAutomation.monitoring_entry.patient_name &&
          entry.status === normalizedAutomation.monitoring_entry.status &&
          entry.occurred_at === normalizedAutomation.monitoring_entry.occurred_at,
      );

      if (!monitoringAlreadyTracked) {
        const updatedSmsLog = [normalizedAutomation.monitoring_entry, ...storedSmsLog].slice(0, 5);
        window.localStorage.setItem("recap_sms_log", JSON.stringify(updatedSmsLog));
      }
    }

    if (normalizedAutomation?.doctor_alert_triggered && normalizedResult.name) {
      window.localStorage.setItem(`doctor-alert:${normalizedResult.name}:${normalizedResult.risk_level || "LOW"}`, "sent");

      if (normalizedAutomation?.doctor_alert) {
        const storedAlerts = readStoredJson("recap_doctor_alerts", []);
        const alertAlreadyTracked = storedAlerts.some(
          (entry) =>
            entry.patient_name === normalizedAutomation.doctor_alert.patient_name &&
            entry.reason === normalizedAutomation.doctor_alert.reason &&
            entry.occurred_at === normalizedAutomation.doctor_alert.occurred_at,
        );

        if (!alertAlreadyTracked) {
          const updatedAlerts = [normalizedAutomation.doctor_alert, ...storedAlerts].slice(0, 6);
          window.localStorage.setItem("recap_doctor_alerts", JSON.stringify(updatedAlerts));
        }
      }
    }

    setPatients((current) => {
      const nextPatient = {
        name: normalizedResult.name || "Unknown Patient",
        age: normalizedResult.age || "Not Found",
        disease: normalizedResult.disease || "Not Found",
        risk_level: normalizedResult.risk_level || "LOW",
        risk_score: normalizedResult.risk_score ?? 0,
        phone: normalizedResult.phone || "Not Provided",
      };

      const updatedPatients = [nextPatient, ...current].slice(0, 6);
      window.localStorage.setItem("recap_patients", JSON.stringify(updatedPatients));
      return updatedPatients;
    });
  };

  const handleDocumentSelected = (file) => {
    setResult(null);
    setAutomation(null);
    setShowHighRiskPopup(false);
    window.localStorage.removeItem("recap_result");
    window.localStorage.removeItem("recap_automation");

    const nextAction = file?.name
      ? `Document selected: ${file.name}. Analysis pending`
      : "Document cleared";
    setLastAction(nextAction);
    window.localStorage.setItem("recap_last_action", JSON.stringify(nextAction));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    window.localStorage.setItem("recap_mode", JSON.stringify(nextMode));
  };

  const switchPanel = (panel) => {
    setActivePanel(panel);
    window.localStorage.setItem("recap_active_panel", JSON.stringify(panel));
  };

  const handleActionUpdate = (message) => {
    setLastAction(message);
    window.localStorage.setItem("recap_last_action", JSON.stringify(message));
  };

  const handleMonitoringUpdate = (nextState) => {
    setMonitoringState(nextState);
    window.localStorage.setItem("recap_monitoring_state", JSON.stringify(nextState));
  };

  const readmissionsPrevented = Math.max(
    1,
    Math.round((patientCount * 0.08 * Math.max(monitoringState.adherence, 25)) / 100),
  );
  const impactSavings = readmissionsPrevented * avgCost;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes recap-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        button {
          position: relative;
          overflow: hidden;
          transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
        }

        button:hover {
          transform: scale(1.05);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 16px 30px rgba(37, 99, 235, 0.18);
          filter: brightness(1.03);
        }

        button:active {
          transform: scale(0.97);
          filter: brightness(1.08);
          box-shadow: 0 0 0 999px rgba(255, 255, 255, 0.10) inset, 0 10px 18px rgba(15, 23, 42, 0.12);
        }

        button::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(255, 255, 255, 0);
          transition: border-color 0.18s ease, opacity 0.18s ease;
          pointer-events: none;
        }

        button:hover::after {
          border-color: rgba(255, 255, 255, 0.28);
        }

        [data-recap-card="true"]:hover {
          transform: translateY(-4px);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
        }

        [data-recap-shimmer="true"] {
          position: relative;
          overflow: hidden;
        }

        [data-recap-shimmer="true"]::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            110deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.18) 38%,
            rgba(255, 255, 255, 0.3) 50%,
            rgba(255, 255, 255, 0.18) 62%,
            rgba(255, 255, 255, 0) 100%
          );
          background-size: 200% 100%;
          animation: recap-shimmer 4.2s linear infinite;
          pointer-events: none;
        }
      `}</style>
      <HighRiskPopup open={showHighRiskPopup} onClose={() => setShowHighRiskPopup(false)} />
      <div style={styles.glowOne} />
      <div style={styles.glowTwo} />
      <div style={styles.gridOverlay} />

      <main style={styles.shell}>
        <SystemStatus lastAction={lastAction} />
        <section style={styles.hero}>
          <div>
            <p style={styles.kicker}>Healthcare Readmission Intelligence</p>
            <h1 style={styles.title}>RECAP AI</h1>
            <p style={styles.subtitle}>
              A judge-ready workflow for discharge OCR, explainable risk scoring, smart monitoring, and escalation.
            </p>
          </div>

          <div style={styles.heroCard}>
            <span style={styles.heroCardLabel}>Operational View</span>
            <strong style={styles.heroCardValue}>Predict, Monitor, Escalate</strong>
            <p style={styles.heroCardText}>
              Compact control center with less scrolling and more signal.
            </p>
          </div>
        </section>

        <section style={styles.summaryStrip}>
          <MetricCard label="High Risk" value={highCount} tone="high" />
          <MetricCard label="Medium Risk" value={mediumCount} tone="medium" />
          <MetricCard label="Low Risk" value={lowCount} tone="low" />
          <MetricCard label="Estimated Savings" value={`Rs. ${estimatedSavings.toLocaleString("en-IN")}`} tone="neutral" />
        </section>

        <section style={styles.workspace}>
          <div style={styles.leftRail}>
            <div data-recap-card="true" style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Risk Prediction Input</h2>
                <p style={styles.cardText}>
                  Analyze from discharge document or enter details manually.
                </p>
              </div>

              <div style={styles.toggleRow}>
                <button
                  type="button"
                  onClick={() => switchMode("upload")}
                  style={{
                    ...styles.toggleButton,
                    ...(mode === "upload" ? styles.toggleActiveBlue : {}),
                  }}
                >
                  Document Upload
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("manual")}
                  style={{
                    ...styles.toggleButton,
                    ...(mode === "manual" ? styles.toggleActiveGreen : {}),
                  }}
                >
                  Manual Entry
                </button>
              </div>

              {mode === "upload" ? (
                <Upload
                  onUploadSuccess={handleResult}
                  onActionUpdate={handleActionUpdate}
                  onDocumentSelected={handleDocumentSelected}
                />
              ) : (
                <ManualEntry onSubmitSuccess={handleResult} />
              )}
            </div>

            <div data-recap-card="true" style={styles.card}>
              <Dashboard data={result} automation={automation} monitoringState={monitoringState} />
            </div>

            <div data-recap-card="true" style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Live Risk Dashboard</h2>
                <p style={styles.cardText}>
                  Recent analyzed patients displayed in a compact triage board.
                </p>
              </div>

              <div style={styles.patientBoard}>
                {patients.map((patient, index) => (
                  <div key={`${patient.name}-${index}`} style={styles.patientRow}>
                    <div>
                      <strong style={styles.patientName}>{patient.name}</strong>
                      <p style={styles.patientMeta}>
                        Age: {patient.age} | {patient.disease}
                      </p>
                    </div>
                    <span
                      style={{
                        ...styles.patientBadge,
                        backgroundColor: getRiskColor(patient.risk_level),
                      }}
                    >
                      {formatRiskLabel(patient.risk_level)} ({patient.risk_score}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.rightRail}>
            <div data-recap-card="true" style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Care Coordination Workspace</h2>
                <p style={styles.cardText}>
                  Switch between business impact, SMS monitoring, family support, and doctor escalation.
                </p>
              </div>

              <div style={styles.panelTabs}>
                <PanelTab
                  label="Monitoring"
                  active={activePanel === "monitoring"}
                  onClick={() => switchPanel("monitoring")}
                />
                <PanelTab
                  label="Family"
                  active={activePanel === "family"}
                  onClick={() => switchPanel("family")}
                />
                <PanelTab
                  label="Doctor"
                  active={activePanel === "doctor"}
                  onClick={() => switchPanel("doctor")}
                />
                <PanelTab
                  label="Impact"
                  active={activePanel === "impact"}
                  onClick={() => switchPanel("impact")}
                />
              </div>

              <div style={styles.panelBody}>
                {activePanel === "monitoring" ? (
                  <SmsMonitor
                    automation={automation}
                    patientName={result?.name || "Patient"}
                    riskLevel={result?.risk_level || "LOW"}
                    onMonitoringUpdate={handleMonitoringUpdate}
                  />
                ) : null}

                {activePanel === "family" ? (
                  <FamilyAlert
                    patientName={result?.name || "Patient"}
                    riskLevel={result?.risk_level || "LOW"}
                  />
                ) : null}

                {activePanel === "doctor" ? (
                  <DoctorAlert
                    patientName={result?.name || "Patient"}
                    riskLevel={result?.risk_level || "LOW"}
                  />
                ) : null}

                {activePanel === "impact" ? (
                  <div>
                    <div style={styles.cardHeader}>
                      <h2 style={styles.cardTitle}>Cost Calculator</h2>
                      <p style={styles.cardText}>
                        Show the business value of reducing avoidable readmissions.
                      </p>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Patients Monitored</label>
                      <input
                        type="number"
                        min="0"
                        value={patientCount}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value) || 0;
                          setPatientCount(nextValue);
                          window.localStorage.setItem("recap_patient_count", JSON.stringify(nextValue));
                        }}
                        style={styles.input}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Average Readmission Cost (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        value={avgCost}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value) || 0;
                          setAvgCost(nextValue);
                          window.localStorage.setItem("recap_avg_cost", JSON.stringify(nextValue));
                        }}
                        style={styles.input}
                      />
                    </div>

                    <div style={styles.impactCard}>
                      <span style={styles.impactLabel}>Estimated Savings</span>
                      <strong style={styles.impactValue}>Rs. {impactSavings.toLocaleString("en-IN")}</strong>
                      <p style={styles.impactText}>
                        Assuming early follow-up and adherence support prevent 15% of costly readmissions.
                      </p>
                    </div>

                    <div style={styles.impactCard}>
                      <span style={styles.impactLabel}>Readmissions Prevented</span>
                      <strong style={styles.impactValue}>{readmissionsPrevented}</strong>
                      <p style={styles.impactText}>
                        Based on current adherence of {monitoringState.adherence}% across {monitoringState.totalInteractions} monitored interactions.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function normalizeResult(result) {
  if (!result) {
    return null;
  }

  const occurredAt = result.occurred_at || result.risk_evaluated_at || result.ocr_completed_at || createTimestamp();

  return {
    ...result,
    occurred_at: occurredAt,
    ocr_completed_at: result.ocr_completed_at || occurredAt,
    risk_evaluated_at: result.risk_evaluated_at || occurredAt,
    automation: normalizeAutomation(result.automation || null),
  };
}

function normalizeAutomation(automation) {
  if (!automation) {
    return null;
  }

  const monitoringEntry = automation.monitoring_entry ? ensureTimestamp(automation.monitoring_entry) : null;
  const doctorAlert = automation.doctor_alert ? ensureTimestamp(automation.doctor_alert) : null;

  return {
    ...automation,
    monitoring_entry: monitoringEntry,
    doctor_alert: doctorAlert,
  };
}

function MetricCard({ label, value, tone }) {
  return (
    <div style={{ ...styles.metricCard, ...metricToneStyles[tone] }}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={styles.metricValue}>{value}</strong>
    </div>
  );
}

function PanelTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.panelTab,
        ...(active ? styles.panelTabActive : {}),
      }}
    >
      {label}
    </button>
  );
}

function formatPhone(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("91") && digits.length >= 11) {
    return `+91 ${digits.slice(2)}`;
  }
  return phone || "demo number";
}

function formatRiskLabel(riskLevel) {
  if (riskLevel === "HIGH") {
    return "High";
  }
  if (riskLevel === "MEDIUM") {
    return "Medium";
  }
  return "Low";
}

function getRiskColor(riskLevel) {
  if (riskLevel === "HIGH") {
    return "#dc2626";
  }
  if (riskLevel === "MEDIUM") {
    return "#f97316";
  }
  return "#16a34a";
}

const metricToneStyles = {
  high: {
    background: "linear-gradient(135deg, #fee2e2 0%, #fff1f2 100%)",
  },
  medium: {
    background: "linear-gradient(135deg, #ffedd5 0%, #fff7ed 100%)",
  },
  low: {
    background: "linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)",
  },
  neutral: {
    background: "linear-gradient(135deg, #dbeafe 0%, #ecfeff 100%)",
  },
};

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(147, 197, 253, 0.28), transparent 28%), radial-gradient(circle at top right, rgba(125, 211, 252, 0.18), transparent 24%), linear-gradient(180deg, #f6fbff 0%, #eef4fb 52%, #e8f0fb 100%)",
    position: "relative",
    overflow: "hidden",
    fontFamily: "\"Segoe UI\", Arial, sans-serif",
    color: "#10213a",
  },
  glowOne: {
    position: "absolute",
    width: "560px",
    height: "560px",
    top: "-180px",
    left: "-120px",
    borderRadius: "50%",
    background: "rgba(59, 130, 246, 0.18)",
    filter: "blur(58px)",
  },
  glowTwo: {
    position: "absolute",
    width: "440px",
    height: "440px",
    bottom: "-120px",
    right: "-120px",
    borderRadius: "50%",
    background: "rgba(56, 189, 248, 0.16)",
    filter: "blur(52px)",
  },
  gridOverlay: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px)",
    backgroundSize: "44px 44px",
    maskImage: "linear-gradient(180deg, rgba(0,0,0,0.7), transparent)",
    pointerEvents: "none",
  },
  shell: {
    position: "relative",
    zIndex: 1,
    maxWidth: "1360px",
    margin: "0 auto",
    padding: "32px 20px 40px",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "20px",
    marginBottom: "20px",
  },
  kicker: {
    margin: "0 0 10px",
    color: "#2563eb",
    fontWeight: 700,
    fontSize: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    margin: "0 0 12px",
    fontSize: "56px",
    lineHeight: 0.95,
  },
  subtitle: {
    margin: 0,
    maxWidth: "760px",
    color: "#52627a",
    fontSize: "18px",
    lineHeight: 1.6,
  },
  heroCard: {
    minWidth: "260px",
    background: "linear-gradient(145deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.88) 100%)",
    color: "#ffffff",
    borderRadius: "22px",
    padding: "20px 22px",
    border: "1px solid rgba(191, 219, 254, 0.12)",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18), 0 28px 60px rgba(15, 23, 42, 0.14)",
    backdropFilter: "blur(10px)",
  },
  heroCardLabel: {
    display: "block",
    marginBottom: "8px",
    color: "#93c5fd",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  heroCardValue: {
    display: "block",
    fontSize: "24px",
    lineHeight: 1.2,
  },
  heroCardText: {
    margin: "10px 0 0",
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
    marginBottom: "20px",
  },
  metricCard: {
    borderRadius: "20px",
    padding: "16px 18px",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255,255,255,0.65)",
    backdropFilter: "blur(10px)",
  },
  metricLabel: {
    display: "block",
    marginBottom: "8px",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: "32px",
    lineHeight: 1,
    color: "#0f172a",
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.05fr) minmax(360px, 0.95fr)",
    gap: "20px",
    alignItems: "start",
  },
  leftRail: {
    display: "grid",
    gap: "20px",
  },
  rightRail: {
    display: "grid",
    gap: "20px",
  },
  card: {
    background: "linear-gradient(180deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.72) 100%)",
    border: "1px solid rgba(217, 229, 244, 0.9)",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.07), 0 28px 70px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255,255,255,0.7)",
    backdropFilter: "blur(14px)",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  cardHeader: {
    marginBottom: "16px",
  },
  cardTitle: {
    margin: "0 0 8px",
    fontSize: "28px",
  },
  cardText: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.6,
  },
  toggleRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "18px",
    flexWrap: "wrap",
  },
  toggleButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "999px",
    padding: "10px 16px",
    background: "#ffffff",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
  },
  toggleActiveBlue: {
    background: "#dbeafe",
    borderColor: "#93c5fd",
    color: "#1d4ed8",
  },
  toggleActiveGreen: {
    background: "#ccfbf1",
    borderColor: "#5eead4",
    color: "#0f766e",
  },
  patientBoard: {
    display: "grid",
    gap: "10px",
  },
  patientRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px 0",
    borderBottom: "1px solid #e2e8f0",
  },
  patientName: {
    display: "block",
    color: "#0f172a",
    marginBottom: "4px",
  },
  patientMeta: {
    margin: 0,
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  patientBadge: {
    color: "#ffffff",
    padding: "9px 12px",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  panelTabs: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },
  panelTab: {
    border: "1px solid #dbe3f0",
    background: "#f8fbff",
    color: "#334155",
    borderRadius: "999px",
    padding: "10px 15px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
  },
  panelTabActive: {
    background: "#10213a",
    color: "#ffffff",
    borderColor: "#10213a",
    boxShadow: "0 10px 20px rgba(16, 33, 58, 0.15)",
  },
  panelBody: {
    minHeight: "420px",
  },
  formGroup: {
    display: "grid",
    gap: "8px",
    marginBottom: "14px",
  },
  label: {
    fontWeight: 600,
    color: "#334155",
  },
  input: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: "14px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontSize: "16px",
    boxSizing: "border-box",
  },
  impactCard: {
    marginTop: "12px",
    borderRadius: "20px",
    padding: "18px 20px",
    background: "linear-gradient(135deg, rgba(219, 234, 254, 0.9) 0%, rgba(236, 254, 255, 0.88) 100%)",
    border: "1px solid rgba(191, 219, 254, 0.92)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65), 0 16px 30px rgba(59, 130, 246, 0.08)",
  },
  impactLabel: {
    display: "block",
    marginBottom: "8px",
    color: "#1d4ed8",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  impactValue: {
    display: "block",
    fontSize: "38px",
    lineHeight: 1,
    color: "#0f172a",
  },
  impactText: {
    margin: "10px 0 0",
    color: "#52627a",
    lineHeight: 1.5,
  },
};

export default App;
