import React, { useState } from "react";

function ManualEntry({ onSubmitSuccess }) {
  const [form, setForm] = useState({
    name: "",
    age: "",
    disease: "",
    prior_admission: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/predict-risk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          age: Number(form.age) || 0,
          disease: form.disease,
          prior_admission: form.prior_admission,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Prediction failed.");
      }

      onSubmitSuccess(data);
    } catch (requestError) {
      setError(requestError.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.grid}>
        <label style={styles.field}>
          <span style={styles.label}>Patient Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => handleChange("name", event.target.value)}
            style={styles.input}
            placeholder="Enter patient name"
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Age</span>
          <input
            type="number"
            min="0"
            value={form.age}
            onChange={(event) => handleChange("age", event.target.value)}
            style={styles.input}
            placeholder="Enter age"
          />
        </label>
      </div>

      <label style={styles.field}>
        <span style={styles.label}>Disease</span>
        <input
          type="text"
          value={form.disease}
          onChange={(event) => handleChange("disease", event.target.value)}
          style={styles.input}
          placeholder="Example: Diabetes"
        />
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={form.prior_admission}
          onChange={(event) => handleChange("prior_admission", event.target.checked)}
        />
        <span>Prior admission / previous hospital admission</span>
      </label>

      <button type="submit" style={styles.button} disabled={loading}>
        {loading ? "Predicting..." : "Predict Risk"}
      </button>

      {error ? <p style={styles.error}>{error}</p> : null}
    </form>
  );
}

const styles = {
  form: {
    display: "grid",
    gap: "16px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
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
    fontSize: "16px",
    boxSizing: "border-box",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#475569",
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
    fontWeight: 500,
  },
};

export default ManualEntry;
