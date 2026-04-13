import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authAPI } from "../api/index";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.login(form);
      const data = res.data;

      // Navigate FIRST before updating state to avoid redirect conflicts
      if (!data.preferred_genres || data.preferred_genres === "") {
        navigate("/onboarding", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
      login(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(30,41,59,0.8)",
    border: "1px solid rgba(20,184,166,0.2)",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#f1f5f9",
    fontSize: "14px",
    outline: "none",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
          linear-gradient(rgba(20,184,166,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(20,184,166,0.04) 1px, transparent 1px)
        `,
          backgroundSize: "40px 40px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "400px",
          height: "400px",
          background:
            "radial-gradient(circle, rgba(20,184,166,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "420px",
          margin: "0 1rem",
          background: "rgba(15,23,42,0.85)",
          border: "1px solid rgba(20,184,166,0.2)",
          borderRadius: "16px",
          padding: "2.5rem",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "0.5rem",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                background: "#14b8a6",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill="#0a0f1e" />
                <circle cx="4" cy="6" r="2" fill="#0a0f1e" />
                <circle cx="20" cy="6" r="2" fill="#0a0f1e" />
                <circle cx="4" cy="18" r="2" fill="#0a0f1e" />
                <circle cx="20" cy="18" r="2" fill="#0a0f1e" />
                <line
                  x1="12"
                  y1="9"
                  x2="4"
                  y2="6"
                  stroke="#0a0f1e"
                  strokeWidth="1.5"
                />
                <line
                  x1="12"
                  y1="9"
                  x2="20"
                  y2="6"
                  stroke="#0a0f1e"
                  strokeWidth="1.5"
                />
                <line
                  x1="12"
                  y1="15"
                  x2="4"
                  y2="18"
                  stroke="#0a0f1e"
                  strokeWidth="1.5"
                />
                <line
                  x1="12"
                  y1="15"
                  x2="20"
                  y2="18"
                  stroke="#0a0f1e"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <span
              style={{
                fontSize: "20px",
                fontWeight: "700",
                color: "#f1f5f9",
                letterSpacing: "-0.5px",
              }}
            >
              GNN<span style={{ color: "#14b8a6" }}>MOVIE</span>
            </span>
          </div>
          <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
            Graph Neural Network Recommendation
          </p>
        </div>

        <h2
          style={{
            color: "#f1f5f9",
            fontSize: "22px",
            fontWeight: "600",
            margin: "0 0 1.5rem 0",
          }}
        >
          Sign In
        </h2>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label
              style={{
                display: "block",
                color: "#94a3b8",
                fontSize: "13px",
                marginBottom: "6px",
              }}
            >
              Email
            </label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "#14b8a6")}
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(20,184,166,0.2)")
              }
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                color: "#94a3b8",
                fontSize: "13px",
                marginBottom: "6px",
              }}
            >
              Password
            </label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "#14b8a6")}
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(20,184,166,0.2)")
              }
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#f87171",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "rgba(20,184,166,0.5)" : "#14b8a6",
              color: "#0a0f1e",
              border: "none",
              borderRadius: "8px",
              padding: "11px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: "0.5rem",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.target.style.background = "#0d9488";
            }}
            onMouseLeave={(e) => {
              if (!loading) e.target.style.background = "#14b8a6";
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            color: "#64748b",
            fontSize: "13px",
            marginTop: "1.5rem",
            marginBottom: 0,
          }}
        >
          New to GNNMOVIE?{" "}
          <Link
            to="/register"
            style={{
              color: "#14b8a6",
              textDecoration: "none",
              fontWeight: "500",
            }}
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
