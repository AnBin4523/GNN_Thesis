import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../api/index";

const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Children's",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Film-Noir",
  "Horror",
  "Musical",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "War",
  "Western",
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (genre) => {
    setSelected((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
    setError("");
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      setError("Please select at least one genre");
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.updateGenres(user.user_id, selected);
      updateUser({
        preferred_genres: res.data.preferred_genres,
        ml1m_user_id: res.data.ml1m_user_id,
      });
      navigate("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
        padding: "2rem 1rem",
      }}
    >
      {/* Background grid */}
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

      {/* Glow */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "500px",
          height: "500px",
          background:
            "radial-gradient(circle, rgba(20,184,166,0.10) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "560px",
          background: "rgba(15,23,42,0.85)",
          border: "1px solid rgba(20,184,166,0.2)",
          borderRadius: "16px",
          padding: "2.5rem",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              background: "rgba(20,184,166,0.15)",
              border: "1px solid rgba(20,184,166,0.3)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5z"
                stroke="#14b8a6"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M2 17l10 5 10-5"
                stroke="#14b8a6"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M2 12l10 5 10-5"
                stroke="#14b8a6"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2
            style={{
              color: "#f1f5f9",
              fontSize: "22px",
              fontWeight: "600",
              margin: "0 0 0.5rem",
            }}
          >
            What do you like to watch?
          </h2>
          <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
            Select your favorite genres to get personalized GNN recommendations
          </p>
        </div>

        {/* Genre Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.6rem",
            marginBottom: "1.5rem",
          }}
        >
          {GENRES.map((genre) => {
            const isSelected = selected.includes(genre);
            return (
              <button
                key={genre}
                onClick={() => toggle(genre)}
                style={{
                  background: isSelected
                    ? "rgba(20,184,166,0.2)"
                    : "rgba(30,41,59,0.6)",
                  border: isSelected
                    ? "1px solid #14b8a6"
                    : "1px solid rgba(51,65,85,0.8)",
                  borderRadius: "8px",
                  padding: "10px 8px",
                  color: isSelected ? "#14b8a6" : "#94a3b8",
                  fontSize: "13px",
                  fontWeight: isSelected ? "600" : "400",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "rgba(20,184,166,0.4)";
                    e.currentTarget.style.color = "#cbd5e1";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "rgba(51,65,85,0.8)";
                    e.currentTarget.style.color = "#94a3b8";
                  }
                }}
              >
                {genre}
              </button>
            );
          })}
        </div>

        {/* Selected count */}
        <p
          style={{
            textAlign: "center",
            color: selected.length > 0 ? "#14b8a6" : "#475569",
            fontSize: "13px",
            marginBottom: "1rem",
          }}
        >
          {selected.length === 0
            ? "0 genres selected"
            : `${selected.length} genre${selected.length > 1 ? "s" : ""} selected`}
        </p>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#f87171",
              fontSize: "13px",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            background: loading ? "rgba(20,184,166,0.5)" : "#14b8a6",
            color: "#0a0f1e",
            border: "none",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!loading) e.target.style.background = "#0d9488";
          }}
          onMouseLeave={(e) => {
            if (!loading) e.target.style.background = "#14b8a6";
          }}
        >
          {loading ? "Setting up your profile..." : "Let's Go!"}
        </button>
      </div>
    </div>
  );
}
