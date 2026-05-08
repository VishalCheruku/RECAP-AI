import React, { useEffect, useState } from "react";
import { formatExactTime, formatRelativeTime, useRelativeTimeNow } from "../utils/time";

function SystemTimeline({ data, automation, monitoringState = null }) {
  const now = useRelativeTimeNow();
  const [visibleSteps, setVisibleSteps] = useState(0);
  const latestSmsEntry = readLatestStoredEntry("recap_sms_log");
  const latestFamilyAlert = readLatestStoredEntry("recap_family_alerts");
  const latestDoctorAlert = readLatestStoredEntry("recap_doctor_alerts");
  const steps = [
    { label: "OCR completed", active: true },
    { label: "Risk evaluated", active: Boolean(data?.risk_level) },
    { label: "Monitoring started", active: Boolean(automation?.monitoring_started) },
    { label: "SMS relayed", active: Boolean(automation?.sms_sent || automation?.monitoring_started) },
    {
      label: "Call progress",
      active: automation?.call_status === "completed" || automation?.call_status === "in_progress",
    },
    {
      label: "Alert triggered",
      active: Boolean(automation?.doctor_alert_triggered || monitoringState?.escalationLevel === "doctor"),
    },
    {
      label: "Family notified",
      active: monitoringState?.escalationLevel === "family" || monitoringState?.escalationLevel === "doctor",
    },
    {
      label: "Doctor alerted",
      active: Boolean(automation?.doctor_alert_triggered || monitoringState?.escalationLevel === "doctor"),
    },
  ];

  useEffect(() => {
    if (!data || data.history === "Manual entry") {
      setVisibleSteps(0);
      return;
    }

    setVisibleSteps(0);
    const timeouts = steps.map((_, index) =>
      window.setTimeout(() => {
        setVisibleSteps(index + 1);
      }, 300 + index * 180),
    );

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [data, automation, monitoringState?.escalationLevel]);

  if (!data || data.history === "Manual entry") {
    return null;
  }

  const stepTimes = {
    "OCR completed": data.ocr_completed_at || data.occurred_at,
    "Risk evaluated": data.risk_evaluated_at || data.occurred_at,
    "Monitoring started": automation?.monitoring_entry?.occurred_at,
    "SMS relayed": latestSmsEntry?.occurred_at || automation?.monitoring_entry?.occurred_at,
    "Call progress": automation?.call_result?.timestamp || automation?.monitoring_entry?.occurred_at,
    "Alert triggered": automation?.doctor_alert?.occurred_at || latestDoctorAlert?.occurred_at,
    "Family notified": latestFamilyAlert?.occurred_at,
    "Doctor alerted": automation?.doctor_alert?.occurred_at || latestDoctorAlert?.occurred_at,
  };

  return (
    <>
      <style>{`
        @keyframes recap-timeline-check {
          0% { transform: scale(0.4); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes recap-timeline-fade {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div style={styles.card}>
        <span style={styles.title}>System Activity Timeline</span>
        <div style={styles.timeline}>
          {steps.map((step, index) => {
            const isVisible = index < visibleSteps;
            return (
              <div
                key={step.label}
                style={{
                  ...styles.item,
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(8px)",
                  animation: isVisible ? "recap-timeline-fade 0.35s ease" : "none",
                }}
              >
                <div style={styles.markerColumn}>
                  <span
                    style={{
                      ...styles.marker,
                      ...(step.active ? styles.markerActive : styles.markerInactive),
                    }}
                  >
                    {step.active && isVisible ? <span style={styles.checkmark}>{"\u2713"}</span> : null}
                  </span>
                  {index < steps.length - 1 ? <span style={styles.line} /> : null}
                </div>
                <div style={styles.content}>
                  <strong
                    style={{
                      ...styles.label,
                      color: step.active ? "#0f172a" : "#94a3b8",
                    }}
                  >
                    {step.label}
                  </strong>
                  {stepTimes[step.label] ? (
                    <span style={styles.timeText}>
                      {formatRelativeTime(stepTimes[step.label], now)} {"\u2022"} {formatExactTime(stepTimes[step.label])}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function readLatestStoredEntry(key) {
  try {
    const storedValue = window.localStorage.getItem(key);
    const entries = storedValue ? JSON.parse(storedValue) : [];
    return Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
  } catch (storageError) {
    return null;
  }
}

const styles = {
  card: {
    marginTop: "18px",
    padding: "16px 18px",
    borderRadius: "16px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  title: {
    display: "block",
    marginBottom: "12px",
    color: "#0f172a",
    fontWeight: 700,
  },
  timeline: {
    display: "grid",
    gap: "2px",
  },
  item: {
    display: "grid",
    gridTemplateColumns: "20px 1fr",
    columnGap: "12px",
    alignItems: "start",
    transition: "opacity 0.35s ease, transform 0.35s ease",
  },
  markerColumn: {
    display: "grid",
    justifyItems: "center",
  },
  marker: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    marginTop: "5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
    fontSize: "8px",
    fontWeight: 700,
  },
  markerActive: {
    width: "16px",
    height: "16px",
    marginTop: "2px",
    background: "#0f766e",
  },
  markerInactive: {
    background: "#cbd5e1",
  },
  checkmark: {
    animation: "recap-timeline-check 0.24s ease",
  },
  line: {
    width: "2px",
    minHeight: "26px",
    marginTop: "4px",
    background: "#cbd5e1",
  },
  content: {
    paddingBottom: "10px",
  },
  label: {
    fontSize: "15px",
    lineHeight: 1.5,
  },
  timeText: {
    display: "block",
    marginTop: "4px",
    color: "#64748b",
    fontSize: "12px",
  },
};

export default SystemTimeline;
