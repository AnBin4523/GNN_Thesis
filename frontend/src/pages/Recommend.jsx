import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { useAuth } from "../context/AuthContext";
import { recommendAPI } from "../api/index";

const TMDB_IMG = "https://image.tmdb.org/t/p/w300";

const MODEL_INFO = {
  lightgcn: {
    label: "LightGCN",
    color: "#14b8a6",
    desc: "Main model — simplified graph convolution, best performance",
  },
  ngcf: {
    label: "NGCF",
    color: "#8b5cf6",
    desc: "GNN baseline — neural graph collaborative filtering",
  },
  mf: {
    label: "Matrix Factorization",
    color: "#f59e0b",
    desc: "Non-graph baseline — classic latent factor model",
  },
};

function MovieCard({ item, rank, onClick }) {
  const [hovered, setHovered] = useState(false);
  const poster = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;

  return (
    <div
      onClick={() => onClick(item.movie_id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.75rem",
        borderRadius: "10px",
        background: hovered ? "rgba(30,41,59,0.8)" : "transparent",
        cursor: "pointer",
        transition: "background 0.15s",
        border: "1px solid transparent",
        borderColor: hovered ? "rgba(20,184,166,0.2)" : "transparent",
      }}
    >
      {/* Rank */}
      <div
        style={{
          width: "28px",
          flexShrink: 0,
          textAlign: "center",
          color: rank <= 3 ? "#14b8a6" : "#334155",
          fontSize: rank <= 3 ? "16px" : "13px",
          fontWeight: rank <= 3 ? "700" : "400",
        }}
      >
        {rank}
      </div>

      {/* Poster */}
      <div
        style={{
          width: "48px",
          height: "72px",
          flexShrink: 0,
          borderRadius: "6px",
          overflow: "hidden",
          background: "#1e293b",
        }}
      >
        {poster ? (
          <img
            src={poster}
            alt={item.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect
                x="2"
                y="3"
                width="20"
                height="18"
                rx="2"
                stroke="#334155"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#f1f5f9",
            fontSize: "14px",
            fontWeight: "500",
            marginBottom: "4px",
            lineHeight: "1.3",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.title}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {(item.genres || []).slice(0, 3).map((g) => (
            <span
              key={g}
              style={{
                background: "rgba(30,41,59,0.8)",
                border: "1px solid rgba(51,65,85,0.6)",
                borderRadius: "4px",
                padding: "1px 6px",
                color: "#64748b",
                fontSize: "11px",
              }}
            >
              {g}
            </span>
          ))}
        </div>
      </div>

      {/* Score */}
      <div
        style={{
          flexShrink: 0,
          textAlign: "right",
          color: "#334155",
          fontSize: "11px",
        }}
      >
        {item.score?.toFixed(3)}
      </div>
    </div>
  );
}

export default function Recommend() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeModel, setActiveModel] = useState("lightgcn");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [k, setK] = useState(10);

  const ml1mUserId = user?.ml1m_user_id;

  const fetchRecommend = async (model, topK) => {
    if (!ml1mUserId) return;
    setLoading(true);
    try {
      const res = await recommendAPI.getRecommend(ml1mUserId, model, topK);
      setResults((prev) => ({ ...prev, [model]: res.data.items }));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommend(activeModel, k);
  }, [activeModel, k, ml1mUserId]);

  const currentItems = results[activeModel] || [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <Navbar />

      <div
        style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1
            style={{
              color: "#f1f5f9",
              fontSize: "22px",
              fontWeight: "700",
              margin: "0 0 0.4rem",
            }}
          >
            Recommendations
          </h1>
          <p style={{ color: "#475569", fontSize: "13px", margin: 0 }}>
            Top-{k} movies for ML-1M User #{ml1mUserId} · {user?.display_name}
          </p>
        </div>

        {/* Model selector */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          {Object.entries(MODEL_INFO).map(([key, info]) => {
            const active = activeModel === key;
            return (
              <button
                key={key}
                onClick={() => setActiveModel(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: active
                    ? `1px solid ${info.color}`
                    : "1px solid rgba(51,65,85,0.8)",
                  background: active
                    ? `rgba(${key === "lightgcn" ? "20,184,166" : key === "ngcf" ? "139,92,246" : "245,158,11"},0.1)`
                    : "rgba(30,41,59,0.5)",
                  color: active ? info.color : "#64748b",
                  fontSize: "13px",
                  fontWeight: active ? "600" : "400",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: info.color,
                    flexShrink: 0,
                  }}
                />
                {info.label}
                {key === "lightgcn" && (
                  <span
                    style={{
                      background: "rgba(20,184,166,0.2)",
                      border: "1px solid rgba(20,184,166,0.3)",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      color: "#14b8a6",
                      fontSize: "10px",
                      fontWeight: "700",
                    }}
                  >
                    BEST
                  </span>
                )}
              </button>
            );
          })}

          {/* K selector */}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ color: "#64748b", fontSize: "13px" }}>Top</span>
            {[5, 10, 20].map((val) => (
              <button
                key={val}
                onClick={() => setK(val)}
                style={{
                  width: "36px",
                  height: "32px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  border:
                    k === val
                      ? "1px solid #14b8a6"
                      : "1px solid rgba(51,65,85,0.8)",
                  background:
                    k === val ? "rgba(20,184,166,0.1)" : "rgba(30,41,59,0.5)",
                  color: k === val ? "#14b8a6" : "#64748b",
                  cursor: "pointer",
                }}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Model description */}
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            border: `1px solid ${MODEL_INFO[activeModel].color}33`,
            borderRadius: "10px",
            padding: "10px 16px",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: MODEL_INFO[activeModel].color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#94a3b8", fontSize: "13px" }}>
            {MODEL_INFO[activeModel].desc}
          </span>
        </div>

        {/* Results */}
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(30,41,59,0.8)",
            borderRadius: "12px",
            padding: "1rem",
          }}
        >
          {loading ? (
            <div
              style={{
                textAlign: "center",
                color: "#475569",
                padding: "3rem 0",
                fontSize: "14px",
              }}
            >
              Loading recommendations...
            </div>
          ) : currentItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "#475569",
                padding: "3rem 0",
                fontSize: "14px",
              }}
            >
              No recommendations found
            </div>
          ) : (
            <div>
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "0 0.75rem 0.75rem",
                  borderBottom: "1px solid rgba(30,41,59,0.8)",
                  marginBottom: "0.5rem",
                }}
              >
                <div
                  style={{ width: "28px", color: "#334155", fontSize: "11px" }}
                >
                  #
                </div>
                <div
                  style={{ width: "48px", color: "#334155", fontSize: "11px" }}
                >
                  Poster
                </div>
                <div style={{ flex: 1, color: "#334155", fontSize: "11px" }}>
                  Title
                </div>
                <div style={{ color: "#334155", fontSize: "11px" }}>Score</div>
              </div>

              {currentItems.map((item) => (
                <MovieCard
                  key={item.movie_id}
                  item={item}
                  rank={item.rank}
                  onClick={(id) => navigate(`/movies/${id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Compare button */}
        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button
            onClick={() => navigate("/compare")}
            style={{
              background: "transparent",
              border: "1px solid rgba(20,184,166,0.3)",
              borderRadius: "8px",
              padding: "10px 24px",
              color: "#14b8a6",
              fontSize: "13px",
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(20,184,166,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Compare all 3 models →
          </button>
        </div>
      </div>
    </div>
  );
}
