import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { useAuth } from "../context/AuthContext";
import { recommendAPI } from "../api/index";

function DatasetBadge() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(15,23,42,0.7)",
          border: "1px solid rgba(51,65,85,0.6)",
          borderRadius: open ? "8px 8px 0 0" : "8px",
          padding: "8px 14px",
          cursor: "pointer",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span
            style={{
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: "4px",
              padding: "1px 8px",
              color: "#818cf8",
              fontSize: "10px",
              fontWeight: "700",
              letterSpacing: "0.04em",
            }}
          >
            BENCHMARK DATASET
          </span>
          <span style={{ color: "#64748b", fontSize: "12px" }}>
            MovieLens 1M · 6,040 users · 3,706 movies · 1M ratings · movies 1919–2000
          </span>
        </div>
        <span style={{ color: "#334155", fontSize: "10px", flexShrink: 0 }}>
          {open ? "▲" : "▼ why old movies?"}
        </span>
      </button>

      {open && (
        <div
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(51,65,85,0.6)",
            borderTop: "none",
            borderRadius: "0 0 8px 8px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: 0, lineHeight: "1.55" }}>
            <span style={{ color: "#f1f5f9", fontWeight: "500" }}>Why are the recommended movies so old?</span>{" "}
            MovieLens 1M was collected between 2000–2003, so the catalog only
            covers films up to that era. This is intentional — ML-1M is a
            standard academic benchmark widely used in collaborative filtering
            research to enable fair, reproducible comparisons.
          </p>
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: 0, lineHeight: "1.55" }}>
            <span style={{ color: "#f1f5f9", fontWeight: "500" }}>Research contribution.</span>{" "}
            The goal of this thesis is to compare MF, NGCF, and LightGCN under
            identical conditions — same dataset, same train/test split (80/10/10
            per user), same BPR loss, same early-stopping patience. The movie
            catalog is incidental; the algorithmic comparison is the contribution.
          </p>
          <p style={{ color: "#475569", fontSize: "11px", margin: 0, lineHeight: "1.5" }}>
            Note: The original LightGCN paper (He et al., 2020) uses Gowalla,
            Yelp2018, and Amazon-Book — not ML-1M. We adapt it to ML-1M following
            standard implicit-feedback ranking evaluation practice.
          </p>
        </div>
      )}
    </div>
  );
}

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";

const MODELS = {
  mf: {
    label: "Matrix Factorization",
    color: "#f59e0b",
    desc: "Non-graph baseline",
  },
  ngcf: { label: "NGCF", color: "#8b5cf6", desc: "GNN baseline" },
  lightgcn: { label: "LightGCN", color: "#14b8a6", desc: "Main model" },
};

export default function Compare() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const ml1mUserId = user?.ml1m_user_id;

  useEffect(() => {
    const fetchData = async () => {
      if (ml1mUserId == null) return;
      setLoading(true);
      try {
        const res = await recommendAPI.getCompare(ml1mUserId, 10);
        setData(res.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ml1mUserId]);

  const getOverlap = () => {
    if (!data) return new Set();
    const mfIds = new Set(data.mf.map((i) => i.movie_id));
    const ngcfIds = new Set(data.ngcf.map((i) => i.movie_id));
    const lgcnIds = new Set(data.lightgcn.map((i) => i.movie_id));
    return new Set(
      [...mfIds].filter((id) => ngcfIds.has(id) && lgcnIds.has(id)),
    );
  };

  const overlapIds = getOverlap();

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
        style={{ maxWidth: "1300px", margin: "0 auto", padding: "2rem 1.5rem" }}
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
            Model Comparison
          </h1>
          <p style={{ color: "#475569", fontSize: "13px", margin: 0 }}>
            Top-10 recommendations for ML-1M User #{ml1mUserId} across all 3
            models
          </p>
        </div>

        {/* Dataset disclaimer */}
        <DatasetBadge />

        {/* Overlap badge */}
        {!loading && overlapIds.size > 0 && (
          <div
            style={{
              background: "rgba(20,184,166,0.08)",
              border: "1px solid rgba(20,184,166,0.2)",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ color: "#94a3b8", fontSize: "13px" }}>
              <span style={{ color: "#14b8a6", fontWeight: "600" }}>
                {overlapIds.size} movies
              </span>{" "}
              appear in all 3 models — highlighted below
            </span>
          </div>
        )}

        {loading ? (
          <div
            style={{
              textAlign: "center",
              color: "#475569",
              padding: "5rem 0",
              fontSize: "14px",
            }}
          >
            Loading comparison...
          </div>
        ) : data ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1rem",
            }}
          >
            {Object.entries(MODELS).map(([key, info]) => (
              <div
                key={key}
                style={{
                  background: "rgba(15,23,42,0.85)",
                  border: `1px solid ${info.color}33`,
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                {/* Model header */}
                <div
                  style={{
                    padding: "1rem 1.25rem",
                    borderBottom: `1px solid ${info.color}22`,
                    background: `rgba(${
                      key === "lightgcn"
                        ? "20,184,166"
                        : key === "ngcf"
                          ? "139,92,246"
                          : "245,158,11"
                    },0.06)`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: info.color,
                      }}
                    />
                    <span
                      style={{
                        color: info.color,
                        fontSize: "14px",
                        fontWeight: "700",
                      }}
                    >
                      {info.label}
                    </span>
                    {key === "lightgcn" && (
                      <span
                        style={{
                          background: "rgba(20,184,166,0.2)",
                          border: "1px solid rgba(20,184,166,0.4)",
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
                  </div>
                  <div style={{ color: "#475569", fontSize: "11px" }}>
                    {info.desc}
                  </div>
                </div>

                {/* Movie list */}
                <div style={{ padding: "0.5rem" }}>
                  {(data[key] || []).map((item) => {
                    const poster = item.poster_path
                      ? `${TMDB_IMG}${item.poster_path}`
                      : null;
                    const inOverlap = overlapIds.has(item.movie_id);
                    const bgColor =
                      key === "lightgcn"
                        ? "20,184,166"
                        : key === "ngcf"
                          ? "139,92,246"
                          : "245,158,11";
                    return (
                      <div
                        key={item.movie_id}
                        onClick={() => navigate(`/movies/${item.movie_id}`)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.6rem 0.75rem",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "background 0.15s",
                          background: inOverlap
                            ? `rgba(${bgColor},0.06)`
                            : "transparent",
                          borderLeft: inOverlap
                            ? `2px solid ${info.color}`
                            : "2px solid transparent",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(30,41,59,0.8)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = inOverlap
                            ? `rgba(${bgColor},0.06)`
                            : "transparent")
                        }
                      >
                        {/* Rank */}
                        <div
                          style={{
                            width: "20px",
                            flexShrink: 0,
                            textAlign: "center",
                            color: item.rank <= 3 ? info.color : "#334155",
                            fontSize: item.rank <= 3 ? "14px" : "12px",
                            fontWeight: item.rank <= 3 ? "700" : "400",
                          }}
                        >
                          {item.rank}
                        </div>

                        {/* Poster */}
                        <div
                          style={{
                            width: "32px",
                            height: "48px",
                            flexShrink: 0,
                            borderRadius: "4px",
                            overflow: "hidden",
                            background: "#1e293b",
                          }}
                        >
                          {poster ? (
                            <img
                              src={poster}
                              alt={item.title}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
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
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                              >
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

                        {/* Title + genres */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: "#f1f5f9",
                              fontSize: "12px",
                              fontWeight: "500",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginBottom: "2px",
                            }}
                          >
                            {item.title}
                          </div>
                          <div
                            style={{
                              color: "#475569",
                              fontSize: "10px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {(item.genres || []).slice(0, 2).join(", ")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{ textAlign: "center", color: "#f87171", padding: "3rem 0" }}
          >
            Failed to load comparison
          </div>
        )}
      </div>
    </div>
  );
}
