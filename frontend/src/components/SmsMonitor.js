import React, { useEffect, useState } from "react";
import {
  createTimestamp,
  ensureTimestamp,
  formatExactTime,
  formatRelativeTime,
  useRelativeTimeNow,
} from "../utils/time";

const QUICK_MESSAGES = [
  "Take your medication on time today.",
  "Have you taken your medicines today? Reply YES or NO.",
  "Please attend your scheduled follow-up visit.",
];

function SmsMonitor({ patientName = "Patient", riskLevel = "LOW", automation = null, onMonitoringUpdate = () => {} }) {
  const now = useRelativeTimeNow();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState(getDefaultMessage(riskLevel));
  const [loading, setLoading] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [responseStatus, setResponseStatus] = useState(() => readStoredStatus());
  const [sentLog, setSentLog] = useState(() => readStoredLog("recap_sms_log"));
  const [replyLog, setReplyLog] = useState(() => readStoredLog("recap_reply_log"));
  const currentPatientName = patientName || "Patient";
  const patientReplyLog = replyLog.filter((entry) => entry.patient_name === currentPatientName);

  useEffect(() => {
    setMessage(getDefaultMessage(riskLevel));
  }, [riskLevel, patientName]);

  useEffect(() => {
    const totalInteractions = patientReplyLog.length;
    const yesResponses = patientReplyLog.filter((entry) => entry.reply === "YES").length;
    const noResponseCount = patientReplyLog.filter((entry) => entry.reply === "NO RESPONSE").length;
    const adherence = totalInteractions === 0 ? 0 : Math.round((yesResponses / totalInteractions) * 100);
    const escalationLevel = noResponseCount >= 2 ? "doctor" : noResponseCount >= 1 ? "family" : "none";

    onMonitoringUpdate({
      adherence,
      totalInteractions,
      yesResponses,
      escalationLevel,
    });
  }, [onMonitoringUpdate, patientReplyLog]);

  useEffect(() => {
    if (!automation?.monitoring_started || !automation.monitoring_entry) {
      setStatus("");
      setResponseStatus(null);
      window.localStorage.removeItem("recap_sms_response_status");
      return;
    }

    const existingAutomaticEntry = readExistingAutomaticEntry(
      "recap_sms_log",
      automation.monitoring_entry.patient_name,
      automation.monitoring_entry.status,
    );
    const latestReply = getLatestReplyForPatient(patientReplyLog, automation.monitoring_entry.patient_name);
    const automaticSmsEntry = ensureTimestamp({
      patient_name: automation.monitoring_entry.patient_name,
      phone_number: automation.monitoring_entry.phone_number,
      message: automation.monitoring_entry.message,
      status: automation.monitoring_entry.status,
      delivery_log: automation.monitoring_entry.delivery_log,
      provider: automation.monitoring_entry.provider,
      occurred_at:
        automation.monitoring_entry.occurred_at ||
        existingAutomaticEntry?.occurred_at ||
        createTimestamp(),
    });

    const key = `auto-monitoring:${automation.monitoring_entry.patient_name}:${automation.monitoring_entry.message}`;
    const nextResponseStatus = latestReply
      ? getResponseStatusFromStoredReply(latestReply.reply)
      : getWaitingStatus();
    const nextStatus = latestReply
      ? `Latest patient response: ${latestReply.reply}`
      : getAutomationStatus(automation);

    setSentLog((current) => persistLog("recap_sms_log", upsertMonitoringEntry(current, automaticSmsEntry)));

    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, "shown");
    }

    setStatus(nextStatus);
    setResponseStatus(nextResponseStatus);
    window.localStorage.setItem("recap_sms_response_status", JSON.stringify(nextResponseStatus));
  }, [automation, patientReplyLog, riskLevel]);

  const handleSend = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/send-sms-alert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_name: currentPatientName,
          phone_number: phoneNumber,
          message,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to send SMS.");
      }

      const stampedData = ensureTimestamp(data);
      setSentLog((current) => persistLog("recap_sms_log", [stampedData, ...current].slice(0, 5)));

      const waitingStatus = getWaitingStatus();
      setStatus("Message relayed through SMS");
      setResponseStatus(waitingStatus);
      window.localStorage.setItem("recap_sms_response_status", JSON.stringify(waitingStatus));
    } catch (requestError) {
      setError(requestError.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (reply) => {
    setReplyLoading(true);
    setError("");

    try {
      const normalizedReply = reply === "NO_RESPONSE" ? "NO RESPONSE" : reply;
      const alertTriggered = reply === "NO" || reply === "NO_RESPONSE";
      const responseMessage = getResponseMessage(reply);
      const nextStatus = getResponseStatus(reply);
      const data = {
        patient_name: currentPatientName,
        phone_number: phoneNumber || "Simulation Queue",
        reply: normalizedReply,
        missed_count: reply === "NO" ? 1 : 0,
        no_response_count: reply === "NO_RESPONSE" ? 1 : 0,
        alert_triggered: alertTriggered,
        status: responseMessage,
        occurred_at: createTimestamp(),
      };

      setReplyLog((current) => persistLog("recap_reply_log", [data, ...current].slice(0, 6)));
      setResponseStatus(nextStatus);
      setStatus(`Latest patient response: ${normalizedReply}`);
      window.localStorage.setItem("recap_sms_response_status", JSON.stringify(nextStatus));

      if (alertTriggered) {
        addSimulatedAlert({
          patient_name: currentPatientName,
          reason: "Automated alert triggered for caregiver intervention",
          risk_level: riskLevel,
        });
      }
    } catch (requestError) {
      setError(requestError.message || "Something went wrong.");
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes fadeInStatus {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div>
      <div style={styles.header}>
        <h2 style={styles.title}>SMS Patient Monitoring</h2>
        <p style={styles.text}>
          Simulate medication reminders and simple patient check-ins without requiring a mobile app.
        </p>
      </div>

      {status || responseStatus ? (
        <div
          key={`${status}-${responseStatus?.label || ""}`}
          style={styles.statusCard}
        >
          {status ? <p style={styles.status}>{status}</p> : null}
          {responseStatus ? (
            <p style={{ ...styles.responseStatus, color: responseStatus.color }}>
              <span style={styles.responseIcon}>{responseStatus.icon || ""}</span>
              {responseStatus.label}
            </p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSend} style={styles.form}>
        <label style={styles.field}>
          <span style={styles.label}>Patient Mobile Number</span>
          <input
            type="text"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="Example: +91 98765 43210"
            style={styles.input}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Quick Message</span>
          <select value={message} onChange={(event) => setMessage(event.target.value)} style={styles.input}>
            {getMessageOptions(riskLevel).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Sending..." : "Send SMS"}
        </button>

        {error ? <p style={styles.error}>{error}</p> : null}
      </form>

      <div data-recap-card="true" data-recap-shimmer="true" style={styles.logCard}>
        <span style={styles.logTitle}>Recent SMS Activity</span>
        {sentLog.length === 0 ? (
          <p style={styles.emptyText}>No SMS sent yet. Trigger a reminder to show the monitoring flow.</p>
        ) : (
          <div style={styles.logList}>
            {sentLog.map((entry, index) => (
              <div key={`${entry.patient_name}-${entry.message}-${index}`} style={styles.logRow}>
                <strong style={styles.logStatus}>{entry.status}</strong>
                <p style={styles.logMessage}>
                  {entry.patient_name} ({entry.phone_number}): {entry.message}
                  {entry.delivery_log ? ` | ${entry.delivery_log}` : ""}
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

      <div data-recap-card="true" data-recap-shimmer="true" style={styles.logCard}>
        <span style={styles.logTitle}>Missed Medication Detection</span>
        <p style={styles.emptyText}>
          Patient replies YES or NO to medication reminders. Repeated NO responses or no response can trigger escalation.
        </p>

        <div style={styles.adherenceCard}>
          <strong style={styles.adherenceValue}>{calculateAdherence(patientReplyLog)}%</strong>
          <span style={styles.adherenceLabel}>Adherence Tracking</span>
        </div>

        <div style={styles.replyActions}>
          <button
            type="button"
            onClick={() => handleReply("YES")}
            disabled={replyLoading}
            style={{ ...styles.replyButton, ...styles.replyYes }}
          >
            YES
          </button>
          <button
            type="button"
            onClick={() => handleReply("NO")}
            disabled={replyLoading}
            style={{ ...styles.replyButton, ...styles.replyNo }}
          >
            NO
          </button>
          <button
            type="button"
            onClick={() => handleReply("NO_RESPONSE")}
            disabled={replyLoading}
            style={{ ...styles.replyButton, ...styles.replySilent }}
          >
            No Response
          </button>
        </div>

        {patientReplyLog.length === 0 ? (
          <p style={{ ...styles.emptyText, marginTop: "12px" }}>
            No medication replies recorded yet.
          </p>
        ) : (
          <div style={{ ...styles.logList, marginTop: "12px" }}>
            {patientReplyLog.map((entry, index) => (
              <div key={`${entry.patient_name}-${entry.reply}-${index}`} style={styles.logRow}>
                <strong
                  style={{
                    ...styles.logStatus,
                    color: entry.alert_triggered ? "#dc2626" : "#0f766e",
                  }}
                >
                  {entry.status}
                </strong>
                <p style={styles.logMessage}>
                  {entry.patient_name} replied {entry.reply}. Consecutive missed count: {entry.missed_count}. No response count: {entry.no_response_count || 0}
                  {entry.alert_triggered ? " | Escalation triggered." : ""}
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
    </>
  );
}

function persistLog(key, entries) {
  window.localStorage.setItem(key, JSON.stringify(entries));
  return entries;
}

function upsertMonitoringEntry(currentLog, automaticSmsEntry) {
  return [
    automaticSmsEntry,
    ...currentLog.filter((entry) => entry.status !== automaticSmsEntry.status),
  ].slice(0, 5);
}

function getAutomationStatus(automation) {
  const statusMessages = {
    in_progress: "Call is in progress",
    completed: "Message relayed through SMS and call",
    pending: "Message relayed through SMS; call pending",
    not_required: "Message relayed through SMS",
    failed: "Message relayed through SMS; call could not complete",
  };

  return statusMessages[automation?.call_status] || automation?.monitoring_message || "Message relayed through SMS";
}

function readStoredLog(key) {
  try {
    const storedLog = window.localStorage.getItem(key);
    const normalized = storedLog ? JSON.parse(storedLog).map(ensureTimestamp) : [];
    window.localStorage.setItem(key, JSON.stringify(normalized));
    return normalized;
  } catch (storageError) {
    return [];
  }
}

function readExistingAutomaticEntry(key, patientName, status) {
  try {
    const storedLog = window.localStorage.getItem(key);
    const entries = storedLog ? JSON.parse(storedLog).map(ensureTimestamp) : [];
    return entries.find((entry) => entry.patient_name === patientName && entry.status === status) || null;
  } catch (storageError) {
    return null;
  }
}

function readStoredStatus() {
  try {
    const storedStatus = window.localStorage.getItem("recap_sms_response_status");
    return storedStatus ? JSON.parse(storedStatus) : null;
  } catch (storageError) {
    return null;
  }
}

function getWaitingStatus() {
  return {
    label: "Waiting for response...",
    color: "#b45309",
    icon: "\u26A0\uFE0F",
  };
}

function getResponseMessage(reply) {
  if (reply === "YES") {
    return "Patient is compliant";
  }
  if (reply === "NO") {
    return "Patient missed medication";
  }
  return "No response detected";
}

function getResponseStatus(reply) {
  if (reply === "YES") {
    return {
      label: "\u2714 Patient compliant",
      color: "#16a34a",
      icon: "\u2714",
    };
  }
  if (reply === "NO") {
    return {
      label: "\u26A0\uFE0F Medication missed -> Alert triggered",
      color: "#dc2626",
      icon: "\u26A0\uFE0F",
    };
  }
  return {
    label: "\u26A0\uFE0F No response -> Escalation triggered",
    color: "#dc2626",
    icon: "\u26A0\uFE0F",
  };
}

function getResponseStatusFromStoredReply(reply) {
  if (reply === "NO RESPONSE") {
    return getResponseStatus("NO_RESPONSE");
  }

  return getResponseStatus(reply);
}

function getLatestReplyForPatient(replyLog, patientName) {
  return replyLog.find((entry) => entry.patient_name === patientName) || null;
}

function addSimulatedAlert({ patient_name, reason, risk_level }) {
  try {
    const storedAlerts = window.localStorage.getItem("recap_doctor_alerts");
    const currentAlerts = storedAlerts ? JSON.parse(storedAlerts) : [];
    const nextAlert = {
      patient_name,
      reason,
      risk_level,
      status: "AUTO ALERT TRIGGERED",
      occurred_at: createTimestamp(),
    };
    const updatedAlerts = [nextAlert, ...currentAlerts].slice(0, 6);
    window.localStorage.setItem("recap_doctor_alerts", JSON.stringify(updatedAlerts));
  } catch (storageError) {
    return;
  }
}

function calculateAdherence(replyLog) {
  if (replyLog.length === 0) {
    return 0;
  }

  const yesResponses = replyLog.filter((entry) => entry.reply === "YES").length;
  return Math.round((yesResponses / replyLog.length) * 100);
}

function getDefaultMessage(riskLevel) {
  const messages = getMessageOptions(riskLevel);
  return messages[0];
}

function getMessageOptions(riskLevel) {
  if (riskLevel === "HIGH") {
    return [
      "High-risk alert: Please take your medicines, monitor symptoms, and contact your doctor today.",
      "You are marked high risk after discharge. Please attend follow-up urgently.",
      "Have you taken your medicines and checked your symptoms today? Reply YES or NO.",
    ];
  }

  if (riskLevel === "MEDIUM") {
    return [
      "Reminder: Take your medication and attend your follow-up visit on time.",
      "Medium-risk follow-up: Please continue medicines and watch for warning signs.",
      "Have you taken your medicines today? Reply YES or NO.",
    ];
  }

  return QUICK_MESSAGES;
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
    background: "linear-gradient(135deg, #0f766e 0%, #0f9f8d 100%)",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(15, 118, 110, 0.22)",
    transition: "transform 0.18s ease, box-shadow 0.18s ease",
  },
  error: {
    margin: 0,
    color: "#dc2626",
  },
  status: {
    margin: "0 0 14px",
    color: "#0f766e",
    fontWeight: 600,
  },
  responseStatus: {
    margin: 0,
    fontWeight: 700,
  },
  responseIcon: {
    marginRight: "8px",
  },
  statusCard: {
    marginBottom: "14px",
    padding: "12px 14px",
    borderRadius: "14px",
    background: "#f8fafc",
    border: "1px solid #dbeafe",
    animation: "fadeInStatus 0.3s ease",
  },
  logCard: {
    marginTop: "18px",
    padding: "16px",
    borderRadius: "18px",
    background: "linear-gradient(135deg, rgba(240, 253, 244, 0.9) 0%, rgba(248, 250, 252, 0.86) 100%)",
    border: "1px solid rgba(209, 250, 229, 0.95)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65), 0 14px 28px rgba(15, 118, 110, 0.05)",
    transition: "transform 0.22s ease, box-shadow 0.22s ease",
  },
  replyActions: {
    display: "flex",
    gap: "10px",
    marginTop: "12px",
    flexWrap: "wrap",
  },
  replyButton: {
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 0.18s ease, box-shadow 0.18s ease",
  },
  replyYes: {
    background: "#16a34a",
  },
  replyNo: {
    background: "#dc2626",
  },
  replySilent: {
    background: "#475569",
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
  adherenceCard: {
    marginTop: "14px",
    padding: "14px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.82)",
    border: "1px solid rgba(209, 250, 229, 0.95)",
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
  },
  adherenceValue: {
    color: "#0f766e",
    fontSize: "24px",
  },
  adherenceLabel: {
    color: "#475569",
    fontWeight: 600,
  },
  logRow: {
    padding: "12px 14px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.82)",
    border: "1px solid rgba(226, 232, 240, 0.92)",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  },
  logStatus: {
    display: "block",
    marginBottom: "4px",
    color: "#0f766e",
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

export default SmsMonitor;
