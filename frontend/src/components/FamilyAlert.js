import React, { useEffect, useState } from "react";
import {
  createTimestamp,
  ensureTimestamp,
  formatExactTime,
  formatRelativeTime,
  useRelativeTimeNow,
} from "../utils/time";

function FamilyAlert({ patientName = "Patient", riskLevel = "LOW" }) {
  const now = useRelativeTimeNow();
  const [familyContact, setFamilyContact] = useState("");
  const [message, setMessage] = useState(getDefaultFamilyMessage(riskLevel));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [alerts, setAlerts] = useState(() => {
    try {
      const stored = window.localStorage.getItem("recap_family_alerts");
      return stored ? JSON.parse(stored).map(ensureTimestamp) : [];
    } catch (storageError) {
      return [];
    }
  });

  useEffect(() => {
    setMessage(getDefaultFamilyMessage(riskLevel));
  }, [riskLevel, patientName]);

  useEffect(() => {
    if (riskLevel !== "HIGH" || !patientName || patientName === "Patient") {
      setStatus("");
      return;
    }

    const key = `family-auto-alert:${patientName}:${riskLevel}`;
    if (window.localStorage.getItem(key)) {
      setStatus("Automated alert triggered for caregiver intervention");
      return;
    }

    const autoAlertEntry = {
      patient_name: patientName,
      family_contact: familyContact || "System Generated Alert",
      message: getDefaultFamilyMessage(riskLevel),
      risk_level: riskLevel,
      status: "Automated alert triggered for caregiver intervention",
      occurred_at: createTimestamp(),
    };

    setStatus("Automated alert triggered for caregiver intervention");
    setAlerts((current) => {
      const filtered = current.filter(
        (entry) => entry.status !== "Automated alert triggered for caregiver intervention",
      );
      const updated = [ensureTimestamp(autoAlertEntry), ...filtered].slice(0, 5);
        window.localStorage.setItem("recap_family_alerts", JSON.stringify(updated));
        return updated;
    });

    window.localStorage.setItem(key, "sent");
  }, [patientName, riskLevel]);

  const handleSend = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/send-family-alert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_name: patientName || "Patient",
          family_contact: familyContact,
          message,
          risk_level: riskLevel,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to send family alert.");
      }
      const stampedData = ensureTimestamp(data);

      setAlerts((current) => {
        const updated = [stampedData, ...current].slice(0, 5);
        window.localStorage.setItem("recap_family_alerts", JSON.stringify(updated));
        return updated;
      });
    } catch (requestError) {
      setError(requestError.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>Family Alert System</h2>
        <p style={styles.text}>
          Notify a caregiver or family member when patient adherence becomes a concern.
        </p>
      </div>

      <p style={styles.systemLabel}>System Generated Alerts</p>
      {status ? <p style={styles.status}>{status}</p> : null}

      <form onSubmit={handleSend} style={styles.form}>
        <label style={styles.field}>
          <span style={styles.label}>Family Contact</span>
          <input
            type="text"
            value={familyContact}
            onChange={(event) => setFamilyContact(event.target.value)}
            placeholder="Example: +91 98765 43210"
            style={styles.input}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Alert Message</span>
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            style={styles.input}
          />
        </label>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Sending..." : "Send Family Alert"}
        </button>

        {error ? <p style={styles.error}>{error}</p> : null}
      </form>

      <div data-recap-card="true" style={styles.logCard}>
        <span style={styles.logTitle}>Recent Alerts</span>
        {alerts.length === 0 ? (
          <p style={styles.emptyText}>No family alerts sent yet.</p>
        ) : (
          <div style={styles.logList}>
            {alerts.map((entry, index) => (
              <div key={`${entry.patient_name}-${index}`} style={styles.logRow}>
                <strong style={styles.logStatus}>{entry.status}</strong>
                <p style={styles.logMessage}>
                  {entry.patient_name} ({entry.family_contact}): {entry.message}
                </p>
                <span style={styles.logTime}>
                  {formatRelativeTime(entry.occurred_at, now)}
                  {entry.occurred_at ? ` • ${formatExactTime(entry.occurred_at)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getDefaultFamilyMessage(riskLevel) {
  if (riskLevel === "HIGH") {
    return "Automated alert triggered for caregiver intervention";
  }

  if (riskLevel === "MEDIUM") {
    return "Continuous patient monitoring active";
  }

  return "Continuous patient monitoring active";
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
  form: {
    display: "grid",
    gap: "14px",
  },
  field: {
    display: "grid",
    gap: "8px",
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
    fontSize: "15px",
    boxSizing: "border-box",
  },
  button: {
    justifySelf: "start",
    border: "none",
    borderRadius: "14px",
    padding: "14px 22px",
    background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(109, 40, 217, 0.22)",
    transition: "transform 0.18s ease, box-shadow 0.18s ease",
  },
  error: {
    margin: 0,
    color: "#dc2626",
  },
  status: {
    margin: "0 0 14px",
    color: "#b45309",
    fontWeight: 700,
  },
  systemLabel: {
    margin: "0 0 8px",
    color: "#6d28d9",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  logCard: {
    marginTop: "18px",
    padding: "16px",
    borderRadius: "18px",
    background: "linear-gradient(135deg, rgba(250, 245, 255, 0.9) 0%, rgba(248, 250, 252, 0.86) 100%)",
    border: "1px solid rgba(233, 213, 255, 0.95)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65), 0 14px 28px rgba(109, 40, 217, 0.05)",
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
    border: "1px solid rgba(233, 213, 255, 0.92)",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  },
  logStatus: {
    display: "block",
    marginBottom: "4px",
    color: "#6d28d9",
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

export default FamilyAlert;
