import React, { useRef, useState } from "react";
import { buildApiUrl } from "../utils/api";

const ANALYSIS_STEPS = [
  "Reading document structure",
  "Extracting patient details",
  "Interpreting diagnoses and medicines",
  "Scoring readmission risk",
  "Preparing SMS and call workflow",
];

const ACCEPTED_TYPES = ".txt,.json,.pdf,image/*";

function Upload({ onUploadSuccess, onActionUpdate = () => {}, onDocumentSelected = () => {} }) {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [completedSteps, setCompletedSteps] = useState([]);

  const runAnalysisSequence = async () => {
    const finishedSteps = [];
    for (let index = 0; index < ANALYSIS_STEPS.length; index += 1) {
      const step = ANALYSIS_STEPS[index];
      setStatusMessage(step);
      finishedSteps.push(step);
      setCompletedSteps([...finishedSteps]);
      if (index === 1) {
        onActionUpdate("Data extracted");
      }
      if (index === 3) {
        onActionUpdate("Risk evaluated");
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, 420 + index * 120);
      });
    }
  };

  const selectFile = (file) => {
    const nextFile = file || null;
    setSelectedFile(nextFile);
    setError("");
    setStatusMessage(nextFile ? "Ready. Press Analyze to generate the report." : "");
    setCompletedSteps([]);
    onDocumentSelected(nextFile);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setError("Choose a patient document before analysis.");
      return;
    }

    setLoading(true);
    setError("");
    setCompletedSteps([]);
    setStatusMessage("Uploading document");
    onActionUpdate("Document received");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(buildApiUrl("/upload-document"), {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      await runAnalysisSequence();
      onUploadSuccess(data);
      setStatusMessage("Report generated");
    } catch (uploadError) {
      setError(uploadError.message || "Something went wrong.");
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <>
      <style>{`
        @keyframes recap-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.headerRow}>
          <div>
            <span style={styles.sectionLabel}>Document Intake</span>
            <p style={styles.helperText}>Upload discharge summaries, prescriptions, PDFs, images, TXT, or JSON.</p>
          </div>
          <span style={styles.modePill}>Pending</span>
        </div>

        <div
          style={{
            ...styles.dropZone,
            ...(dragActive ? styles.dropZoneActive : {}),
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={(event) => selectFile(event.target.files?.[0])}
            style={styles.input}
          />
          <div style={styles.uploadMark}>+</div>
          <div style={styles.dropCopy}>
            <strong style={styles.dropTitle}>{selectedFile ? selectedFile.name : "Drop patient document here"}</strong>
            <span style={styles.dropText}>
              {selectedFile
                ? `${formatBytes(selectedFile.size)} selected. Ready for analysis.`
                : "or browse from your system"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={styles.secondaryButton}
            disabled={loading}
          >
            Browse
          </button>
        </div>

        <div style={styles.typeRow}>
          {["TXT", "JSON", "PDF", "Image", "Prescription"].map((item) => (
            <span key={item} style={styles.typePill}>{item}</span>
          ))}
        </div>

        <button type="submit" style={styles.button} disabled={loading || !selectedFile}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>

        {error ? <p style={styles.error}>{error}</p> : null}
        {statusMessage ? (
          <div style={styles.statusCard}>
            {loading ? <span style={styles.spinner} /> : <span style={styles.readyDot} />}
            <div>
              <p style={styles.status}>{statusMessage}</p>
              {completedSteps.length > 0 ? (
                <div style={styles.stepGrid}>
                  {ANALYSIS_STEPS.map((step) => (
                    <span
                      key={step}
                      style={{
                        ...styles.stepPill,
                        ...(completedSteps.includes(step) ? styles.stepPillDone : {}),
                      }}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>
    </>
  );
}

function formatBytes(bytes = 0) {
  if (!bytes) {
    return "0 KB";
  }
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.ceil(kb)} KB`;
}

const styles = {
  form: {
    display: "grid",
    gap: "14px",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
  },
  sectionLabel: {
    display: "block",
    marginBottom: "6px",
    color: "#0f766e",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  helperText: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.5,
  },
  modePill: {
    flex: "0 0 auto",
    borderRadius: "999px",
    padding: "7px 10px",
    background: "#ecfeff",
    color: "#0f766e",
    fontSize: "12px",
    fontWeight: 800,
    border: "1px solid #99f6e4",
  },
  dropZone: {
    minHeight: "132px",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "14px",
    padding: "18px",
    borderRadius: "10px",
    border: "1px dashed #38bdf8",
    background: "linear-gradient(135deg, #f8fafc 0%, #ecfeff 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.82)",
  },
  dropZoneActive: {
    borderColor: "#0f766e",
    background: "linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)",
  },
  input: {
    display: "none",
  },
  uploadMark: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    display: "grid",
    placeItems: "center",
    background: "#0f172a",
    color: "#ffffff",
    fontSize: "28px",
    lineHeight: 1,
    fontWeight: 300,
  },
  dropCopy: {
    display: "grid",
    gap: "5px",
    minWidth: 0,
  },
  dropTitle: {
    color: "#0f172a",
    wordBreak: "break-word",
  },
  dropText: {
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.45,
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "10px 14px",
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
  },
  typeRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  typePill: {
    borderRadius: "999px",
    padding: "6px 9px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 700,
  },
  button: {
    justifySelf: "start",
    border: "none",
    borderRadius: "8px",
    padding: "14px 22px",
    background: "#2563eb",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(37, 99, 235, 0.18)",
  },
  error: {
    margin: 0,
    color: "#dc2626",
    fontWeight: 600,
  },
  statusCard: {
    display: "grid",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    alignItems: "start",
    gap: "11px",
    padding: "13px 14px",
    borderRadius: "8px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  spinner: {
    width: "16px",
    height: "16px",
    borderRadius: "999px",
    border: "2px solid #bfdbfe",
    borderTopColor: "#2563eb",
    animation: "recap-spin 0.9s linear infinite",
    marginTop: "2px",
  },
  readyDot: {
    width: "12px",
    height: "12px",
    borderRadius: "999px",
    background: "#16a34a",
    marginTop: "4px",
  },
  status: {
    margin: 0,
    color: "#1d4ed8",
    fontWeight: 800,
  },
  stepGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
    marginTop: "10px",
  },
  stepPill: {
    borderRadius: "999px",
    padding: "6px 8px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 700,
  },
  stepPillDone: {
    color: "#0f766e",
    borderColor: "#99f6e4",
    background: "#ecfeff",
  },
};

export default Upload;
