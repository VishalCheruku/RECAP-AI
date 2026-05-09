import React, { useEffect, useState } from "react";
import { buildApiUrl } from "../utils/api";
import {
  ensureTimestamp,
  ensureTimestampList,
  formatExactTime,
  formatRelativeTime,
  useRelativeTimeNow,
} from "../utils/time";

function DoctorAlert({ patientName = "Patient", riskLevel = "LOW" }) {
  const now = useRelativeTimeNow();
  const [alerts, setAlerts] = useState(() => readStoredDoctorAlerts());
  const [status, setStatus] = useState("");

  useEffect(() => {
    setAlerts(readStoredDoctorAlerts());
  }, [patientName, riskLevel]);

  useEffect(() => {
    if (riskLevel !== "HIGH" || !patientName || patientName === "Patient") {
      return;
    }

    const key = `doctor-alert:${patientName}:${riskLevel}`;
    if (window.localStorage.getItem(key)) {
      return;
    }

    const sendHighRiskAlert = async () => {
      try {
        const response = await fetch(buildApiUrl("/send-doctor-alert"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            patient_name: patientName,
            reason: "High discharge risk",
            risk_level: riskLevel,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Failed to send doctor alert.");
        }
        const stampedData = ensureTimestamp(data);

        setAlerts((current) => persistDoctorAlerts([stampedData, ...current].slice(0, 6)));
        window.localStorage.setItem(key, "sent");
        setStatus("AI monitoring system detected a high-risk condition");
      } catch (error) {
        setStatus("Unable to auto-send high-risk doctor alert.");
      }
    };

    sendHighRiskAlert();
  }, [patientName, riskLevel]);

  const activeAlert = alerts.find((entry) => entry.patient_name === patientName) || alerts[0] || null;
  const isReviewed = Boolean(activeAlert?.reviewed);

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>Doctor Alert System</h2>
        <p style={styles.text}>
          Doctor alerts are triggered only for high-risk patients, repeated missed medicines, or no response.
        </p>
      </div>

      <div data-recap-card="true" style={styles.ruleCard}>
        <span style={styles.ruleTitle}>Smart Escalation Rules</span>
        <ul style={styles.ruleList}>
          <li>High risk patient {"\u2192"} doctor review</li>
          <li>Missed meds repeatedly {"\u2192"} doctor alert</li>
          <li>No response to reminder {"\u2192"} doctor alert</li>
        </ul>
      </div>

      {status ? <p style={styles.status}>{status}</p> : null}
      <button
        type="button"
        onClick={() => {
          setStatus("Doctor review completed");
          setAlerts((current) =>
            persistDoctorAlerts(
              current.map((entry, index) =>
                index === 0 && isMatchingAlert(entry, activeAlert)
                  ? { ...entry, reviewed: true, reviewed_at: entry.reviewed_at || new Date().toISOString() }
                  : entry,
              ),
            ),
          );
        }}
        style={styles.reviewButton}
        disabled={!activeAlert || isReviewed}
      >
        {isReviewed ? "Reviewed" : "Mark as Reviewed"}
      </button>

      <div data-recap-card="true" style={styles.logCard}>
        <span style={styles.logTitle}>Doctor Alert Activity</span>
        {alerts.length === 0 ? (
          <p style={styles.emptyText}>No doctor alerts triggered yet.</p>
        ) : (
          <div style={styles.logList}>
            {alerts.map((entry, index) => (
              <div key={`${entry.patient_name}-${entry.reason}-${index}`} style={styles.logRow}>
                <strong style={styles.logStatus}>{entry.status}</strong>
                <p style={styles.logMessage}>
                  {entry.patient_name}: {entry.reason} ({entry.risk_level})
                  {entry.reviewed ? " | Reviewed" : ""}
                </p>
                <span style={styles.logTime}>
                  {formatRelativeTime(entry.occurred_at, now)}
                  {entry.occurred_at ? ` \u2022 ${formatExactTime(entry.occurred_at)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function readStoredDoctorAlerts() {
  try {
    const stored = window.localStorage.getItem("recap_doctor_alerts");
    const normalized = ensureTimestampList(stored ? JSON.parse(stored) : []).map((entry) => ({
      ...entry,
      reviewed: Boolean(entry.reviewed),
      reviewed_at: entry.reviewed_at || null,
    }));
    window.localStorage.setItem("recap_doctor_alerts", JSON.stringify(normalized));
    return normalized;
  } catch (storageError) {
    return [];
  }
}

function persistDoctorAlerts(alerts) {
  const normalized = ensureTimestampList(alerts).map((entry) => ({
    ...entry,
    reviewed: Boolean(entry.reviewed),
    reviewed_at: entry.reviewed_at || null,
  }));
  window.localStorage.setItem("recap_doctor_alerts", JSON.stringify(normalized));
  return normalized;
}

function isMatchingAlert(entry, activeAlert) {
  if (!entry || !activeAlert) {
    return false;
  }

  return (
    entry.patient_name === activeAlert.patient_name &&
    entry.reason === activeAlert.reason &&
    entry.occurred_at === activeAlert.occurred_at
  );
}

const styles = {
  header: {
    marginBottom: "18px",
  },
  title: {
    margin: "0 0 8px",
    fontSize: "28px",
  },
  text: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.6,
  },
  ruleCard: {
    padding: "16px",
    borderRadius: "18px",
    background: "linear-gradient(135deg, rgba(239, 246, 255, 0.9) 0%, rgba(248, 250, 252, 0.86) 100%)",
    border: "1px solid rgba(191, 219, 254, 0.95)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.68), 0 14px 28px rgba(37, 99, 235, 0.05)",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  ruleTitle: {
    display: "block",
    marginBottom: "10px",
    fontWeight: 700,
    color: "#0f172a",
  },
  ruleList: {
    margin: 0,
    paddingLeft: "20px",
    color: "#475569",
    lineHeight: 1.7,
  },
  status: {
    margin: "14px 0 0",
    color: "#1d4ed8",
    fontWeight: 600,
  },
  reviewButton: {
    marginTop: "14px",
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  logCard: {
    marginTop: "18px",
    padding: "16px",
    borderRadius: "18px",
    background: "linear-gradient(135deg, rgba(255, 247, 237, 0.92) 0%, rgba(248, 250, 252, 0.86) 100%)",
    border: "1px solid rgba(254, 215, 170, 0.95)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.68), 0 14px 28px rgba(194, 65, 12, 0.05)",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  logTitle: {
    display: "block",
    marginBottom: "10px",
    fontWeight: 700,
    color: "#0f172a",
  },
  emptyText: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.6,
  },
  logList: {
    display: "grid",
    gap: "10px",
  },
  logRow: {
    padding: "12px 14px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.82)",
    border: "1px solid rgba(254, 215, 170, 0.92)",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  },
  logStatus: {
    display: "block",
    marginBottom: "4px",
    color: "#c2410c",
  },
  logMessage: {
    margin: 0,
    color: "#475569",
    lineHeight: 1.5,
  },
  logTime: {
    display: "block",
    marginTop: "6px",
    color: "#64748b",
    fontSize: "12px",
  },
};

export default DoctorAlert;
