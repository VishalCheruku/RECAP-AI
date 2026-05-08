import React, { useEffect, useState } from "react";
import SystemTimeline from "./SystemTimeline";

function Dashboard({ data, automation = null, monitoringState = null }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!data) {
      setIsVisible(false);
      return;
    }

    setIsVisible(false);
    const frameId = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [data]);

  if (!data) {
    return (
      <div style={styles.container}>
        <h2 style={styles.heading}>Patient Summary</h2>
        <p style={styles.summaryText}>
          Upload a document and press Analyze to generate extracted patient details and the AI risk result.
        </p>
        <div style={styles.placeholderCard}>
          <span style={styles.placeholderPill}>Awaiting Analysis</span>
          <p style={styles.placeholderText}>
            The result panel stays empty until analysis completes, then shows patient fields and discharge-risk outcome.
          </p>
        </div>
      </div>
    );
  }

  const riskColor = getRiskColor(data.risk_level);
  const riskMessage = getRiskMessage(data.risk_level);
  const riskDisplay = `${formatRiskLabel(data.risk_level)} (${data.risk_score ?? 0}%)`;

  return (
    <>
      <style>{`
        @keyframes recap-high-risk-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 rgba(220, 38, 38, 0.22), 0 16px 30px rgba(220, 38, 38, 0.08);
          }
          50% {
            transform: scale(1.03);
            box-shadow: 0 0 0 12px rgba(220, 38, 38, 0.08), 0 18px 36px rgba(220, 38, 38, 0.16);
          }
        }

        @keyframes recap-high-risk-flicker {
          0%, 88%, 100% {
            filter: brightness(1);
          }
          92% {
            filter: brightness(1.03);
          }
          96% {
            filter: brightness(0.99);
          }
        }
      `}</style>
      <div
        style={{
          ...styles.container,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.45s ease, transform 0.45s ease",
        }}
      >
      <h2 style={styles.heading}>Patient Summary</h2>
      <div
        style={{
          ...styles.riskHero,
          background: getRiskPanel(data.risk_level),
          ...(data.risk_level === "HIGH" ? styles.highRiskHero : {}),
        }}
      >
        <div>
          <span style={styles.riskHeroLabel}>AI Risk Score</span>
          <strong style={styles.riskHeroValue}>{riskDisplay}</strong>
          {data.risk_level === "HIGH" ? (
            <span style={styles.criticalLabel}>CRITICAL CONDITION</span>
          ) : null}
        </div>
        <span
          style={{
            ...styles.riskBadge,
            backgroundColor: riskColor,
            ...(data.risk_level === "HIGH" ? styles.highRiskBadge : {}),
          }}
        >
          {formatRiskLabel(data.risk_level)}
        </span>
      </div>
      <p style={styles.summaryText}>{riskMessage}</p>
      <div style={styles.row}>
        <span style={styles.label}>Name:</span>
        <span>{data.name}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Age:</span>
        <span>{data.age || "Not Found"}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Disease:</span>
        <span>{data.disease}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Routed Contact:</span>
        <span>{data.phone || automation?.notification_phone || "Not Provided"}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>History:</span>
        <span style={styles.valueText}>{data.history || "Not Found"}</span>
      </div>
      <div style={{ ...styles.row, borderBottom: "none", paddingBottom: 0 }}>
        <span style={styles.label}>Risk Level:</span>
        <span style={{ ...styles.riskBadge, backgroundColor: riskColor }}>{riskDisplay}</span>
      </div>
      {automation?.sms_sent ? (
        <div style={styles.notificationCard}>
          <span style={styles.notificationTitle}>Care Action</span>
          <p style={styles.notificationText}>
            {getNotificationMessage(automation)}
          </p>
        </div>
      ) : null}
      {Array.isArray(data.risk_factors) && data.risk_factors.length > 0 ? (
        <div data-recap-shimmer="true" style={styles.factorsCard}>
          <span style={styles.factorsTitle}>{getFactorsTitle(data.risk_level)}</span>
          <ul style={styles.factorList}>
            {data.risk_factors.map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <SystemTimeline data={data} automation={automation} monitoringState={monitoringState} />
      </div>
    </>
  );
}

function formatRiskLabel(riskLevel) {
  if (riskLevel === "HIGH") {
    return "High Risk";
  }

  if (riskLevel === "MEDIUM") {
    return "Medium Risk";
  }

  return "Low Risk";
}

function getFactorsTitle(riskLevel) {
  if (riskLevel === "HIGH") {
    return "High risk because:";
  }

  if (riskLevel === "MEDIUM") {
    return "Medium risk because:";
  }

  return "Low risk because:";
}

function getRiskMessage(riskLevel) {
  if (riskLevel === "HIGH") {
    return "Immediate follow-up is recommended because the patient shows strong high-risk indicators.";
  }

  if (riskLevel === "MEDIUM") {
    return "This patient may benefit from timely outreach, follow-up reminders, and discharge support.";
  }

  return "Current screening suggests a lower discharge risk based on the available document text.";
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

function getRiskPanel(riskLevel) {
  if (riskLevel === "HIGH") {
    return "linear-gradient(135deg, #fee2e2 0%, #fff1f2 100%)";
  }

  if (riskLevel === "MEDIUM") {
    return "linear-gradient(135deg, #ffedd5 0%, #fff7ed 100%)";
  }

  return "linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)";
}

function getNotificationMessage(automation) {
  const messages = {
    in_progress: "Message relayed through SMS. Call is in progress.",
    completed: "Message relayed through SMS and call.",
    pending: "Message relayed through SMS. Call pending.",
    not_required: "Message relayed through SMS. Call not required for low risk.",
    failed: "Message relayed through SMS. Call could not complete.",
  };

  return messages[automation?.call_status] || automation?.monitoring_message || "Message relayed through SMS.";
}

const styles = {
  container: {
    paddingTop: "8px",
  },
  heading: {
    marginTop: 0,
    marginBottom: "10px",
    color: "#0f172a",
    fontSize: "30px",
  },
  summaryText: {
    margin: "0 0 14px",
    color: "#64748b",
    lineHeight: 1.6,
  },
  placeholderCard: {
    borderRadius: "18px",
    padding: "18px",
    background: "linear-gradient(135deg, rgba(239, 246, 255, 0.9) 0%, rgba(248, 250, 252, 0.86) 100%)",
    border: "1px solid rgba(219, 234, 254, 0.9)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  placeholderPill: {
    display: "inline-block",
    marginBottom: "10px",
    padding: "8px 12px",
    borderRadius: "999px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  placeholderText: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.6,
  },
  riskHero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    borderRadius: "20px",
    padding: "18px 18px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    marginBottom: "14px",
  },
  highRiskHero: {
    background: "linear-gradient(135deg, #fee2e2 0%, #fff1f2 55%, #fff7f7 100%)",
    border: "1px solid #ef4444",
    animation: "recap-high-risk-pulse 1.8s ease-in-out infinite, recap-high-risk-flicker 4.6s ease-in-out infinite",
    boxShadow: "0 0 0 1px rgba(239, 68, 68, 0.18), 0 0 24px rgba(239, 68, 68, 0.14)",
  },
  riskHeroLabel: {
    display: "block",
    marginBottom: "8px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  riskHeroValue: {
    display: "block",
    color: "#0f172a",
    fontSize: "32px",
    lineHeight: 1,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    padding: "16px 0",
    borderBottom: "1px solid #e5e7eb",
  },
  label: {
    fontWeight: "bold",
    color: "#334155",
  },
  valueText: {
    maxWidth: "420px",
    textAlign: "right",
    color: "#334155",
    lineHeight: 1.5,
  },
  riskBadge: {
    color: "#ffffff",
    padding: "9px 15px",
    borderRadius: "999px",
    fontWeight: "bold",
    letterSpacing: "0.03em",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.12)",
  },
  highRiskBadge: {
    padding: "12px 18px",
    fontSize: "15px",
    boxShadow: "0 10px 22px rgba(220, 38, 38, 0.22)",
  },
  criticalLabel: {
    display: "inline-block",
    marginTop: "10px",
    color: "#b91c1c",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textShadow: "0 0 10px rgba(239, 68, 68, 0.16)",
  },
  factorsCard: {
    marginTop: "18px",
    padding: "16px 18px",
    borderRadius: "16px",
    background: "linear-gradient(180deg, rgba(248, 250, 252, 0.94) 0%, rgba(255,255,255,0.82) 100%)",
    border: "1px solid rgba(226, 232, 240, 0.95)",
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04)",
  },
  factorsTitle: {
    display: "block",
    marginBottom: "10px",
    color: "#0f172a",
    fontWeight: 700,
  },
  factorList: {
    margin: 0,
    paddingLeft: "20px",
    color: "#475569",
    lineHeight: 1.7,
  },
  notificationCard: {
    marginTop: "14px",
    padding: "14px 16px",
    borderRadius: "10px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
  },
  notificationTitle: {
    display: "block",
    marginBottom: "6px",
    color: "#1d4ed8",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  notificationText: {
    margin: 0,
    color: "#334155",
    lineHeight: 1.5,
    fontWeight: 600,
  },
};

export default Dashboard;
