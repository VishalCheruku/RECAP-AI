import React, { useEffect, useState } from "react";

function SystemStatus({ lastAction = "Waiting for analysis" }) {
  const [displayedAction, setDisplayedAction] = useState(lastAction);
  const [visible, setVisible] = useState(true);
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    setVisible(false);
    setSecondsAgo(0);
    const timeoutId = window.setTimeout(() => {
      setDisplayedAction(lastAction);
      setVisible(true);
    }, 140);

    return () => window.clearTimeout(timeoutId);
  }, [lastAction]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSecondsAgo((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <>
      <style>{`
        @keyframes recap-status-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.28);
          }
          50% {
            transform: scale(1.18);
            box-shadow: 0 0 0 8px rgba(22, 163, 74, 0.08);
          }
        }
      `}</style>
      <div style={styles.card}>
        <div style={styles.row}>
          <span style={styles.dot} />
          <strong style={styles.title}>AI Monitoring Active</strong>
        </div>
        <p
          style={{
            ...styles.text,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(4px)",
          }}
        >
          Last Action: {displayedAction}
        </p>
        <p style={styles.timestamp}>Last updated: {formatSecondsAgo(secondsAgo)}</p>
      </div>
    </>
  );
}

function formatSecondsAgo(secondsAgo) {
  if (secondsAgo === 0) {
    return "just now";
  }

  if (secondsAgo === 1) {
    return "1 second ago";
  }

  return `${secondsAgo} seconds ago`;
}

const styles = {
  card: {
    marginBottom: "20px",
    padding: "14px 16px",
    borderRadius: "18px",
    background: "rgba(255, 255, 255, 0.94)",
    border: "1px solid #d9e5f4",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "6px",
  },
  dot: {
    width: "11px",
    height: "11px",
    borderRadius: "999px",
    background: "#16a34a",
    boxShadow: "0 0 12px rgba(22, 163, 74, 0.28)",
    animation: "recap-status-pulse 1s ease-in-out infinite",
  },
  title: {
    color: "#0f172a",
    fontSize: "15px",
  },
  text: {
    margin: 0,
    color: "#475569",
    fontWeight: 600,
    transition: "opacity 0.24s ease, transform 0.24s ease",
  },
  timestamp: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: "13px",
  },
};

export default SystemStatus;
