import React, { useEffect, useState } from "react";

function HighRiskPopup({ open, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timeoutId = window.setTimeout(() => {
      onClose();
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <>
      <style>{`
        @keyframes recap-alert-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes recap-alert-zoom {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes recap-alert-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(220, 38, 38, 0.20), 0 24px 60px rgba(15, 23, 42, 0.2); }
          50% { box-shadow: 0 0 0 14px rgba(220, 38, 38, 0.08), 0 24px 60px rgba(15, 23, 42, 0.2); }
        }

        @keyframes recap-alert-shake {
          0%, 100% { translate: 0 0; }
          20% { translate: -1px 0; }
          40% { translate: 1px 0; }
          60% { translate: -1px 0; }
          80% { translate: 1px 0; }
        }
      `}</style>
      <div style={styles.backdrop}>
        <div
          style={{
            ...styles.modal,
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1)" : "scale(0.8)",
          }}
        >
          <button type="button" onClick={onClose} style={styles.closeButton}>
            x
          </button>
          <h3 style={styles.title}>HIGH RISK DETECTED</h3>
          <p style={styles.message}>
            AI system automatically initiated monitoring and caregiver alerts
          </p>
        </div>
      </div>
    </>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.36)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 40,
    animation: "recap-alert-fade 0.24s ease",
  },
  modal: {
    position: "relative",
    width: "min(460px, 100%)",
    padding: "24px 24px 20px",
    borderRadius: "22px",
    background: "linear-gradient(180deg, #fff7f7 0%, #ffffff 100%)",
    border: "1px solid #fecaca",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.2)",
    transition: "opacity 0.28s ease, transform 0.28s ease",
    animation:
      "recap-alert-zoom 0.28s ease, recap-alert-pulse 1.8s ease-in-out infinite, recap-alert-shake 0.28s ease 1",
  },
  closeButton: {
    position: "absolute",
    top: "14px",
    right: "14px",
    border: "none",
    background: "#fee2e2",
    color: "#b91c1c",
    width: "30px",
    height: "30px",
    borderRadius: "999px",
    cursor: "pointer",
    fontWeight: 700,
  },
  title: {
    margin: "0 0 10px",
    color: "#991b1b",
    fontSize: "28px",
    letterSpacing: "0.04em",
  },
  message: {
    margin: 0,
    color: "#475569",
    lineHeight: 1.6,
    fontSize: "16px",
  },
};

export default HighRiskPopup;
