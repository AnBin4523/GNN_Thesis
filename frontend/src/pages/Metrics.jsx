import { useState, useEffect } from "react";
import Navbar from "../components/common/Navbar";
import { metricsAPI } from "../api/index";

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w300";

const MODEL_CONFIG = {
  mf: {
    label: "Matrix Factorization",
    color: "#f59e0b",
    short: "MF",
    desc: "Non-graph baseline — classic latent factor model",
  },
  ngcf: {
    label: "NGCF",
    color: "#8b5cf6",
    short: "NGCF",
    desc: "GNN baseline — Neural Graph Collaborative Filtering (2019)",
  },
  lightgcn: {
    label: "LightGCN",
    color: "#14b8a6",
    short: "LightGCN",
    desc: "Main model — simplified graph convolution (SIGIR 2020)",
  },
};

const METRICS = [
  {
    key: "precision_at_10",
    label: "Precision@10",
    desc: "Fraction of top-10 that are relevant",
  },
  {
    key: "recall_at_10",
    label: "Recall@10",
    desc: "Fraction of relevant items retrieved",
  },
  {
    key: "ndcg_at_10",
    label: "NDCG@10",
    desc: "Ranking quality — higher is better",
  },
];

const MODEL_LINE = [
  { key: "mf",       color: "#f59e0b", label: "MF" },
  { key: "ngcf",     color: "#8b5cf6", label: "NGCF" },
  { key: "lightgcn", color: "#14b8a6", label: "LightGCN" },
];

function PatienceChart({ points }) {
  const W = 560, H = 220;
  const PAD = { l: 58, r: 24, t: 24, b: 44 };
  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;
  const n  = points.length;

  const allNdcg = points.flatMap((p) =>
    MODEL_LINE.map((m) => p[m.key].ndcg_at_10),
  );
  const yMin = Math.floor((Math.min(...allNdcg) - 0.004) * 1000) / 1000;
  const yMax = Math.ceil((Math.max(...allNdcg) + 0.003) * 1000) / 1000;

  const xPos = (i) => PAD.l + (i / (n - 1)) * pw;
  const yPos = (v) => PAD.t + ph - ((v - yMin) / (yMax - yMin)) * ph;

  const GRID = 4;
  const yStep = (yMax - yMin) / GRID;
  const optIdx = points.findIndex((p) => p.patience === 10);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxWidth: W, display: "block" }}
    >
      {/* grid */}
      {Array.from({ length: GRID + 1 }).map((_, i) => {
        const v = yMin + i * yStep;
        const y = yPos(v);
        return (
          <g key={i}>
            <line
              x1={PAD.l} y1={y} x2={PAD.l + pw} y2={y}
              stroke="rgba(30,41,59,0.7)" strokeWidth={1}
            />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fill="#475569" fontSize={10}>
              {v.toFixed(3)}
            </text>
          </g>
        );
      })}

      {/* optimal dashed line */}
      {optIdx >= 0 && (
        <line
          x1={xPos(optIdx)} y1={PAD.t}
          x2={xPos(optIdx)} y2={PAD.t + ph}
          stroke="rgba(20,184,166,0.35)" strokeWidth={1} strokeDasharray="4 3"
        />
      )}

      {/* x labels */}
      {points.map((p, i) => (
        <text
          key={p.patience} x={xPos(i)} y={PAD.t + ph + 18}
          textAnchor="middle" fill="#64748b" fontSize={11}
        >
          {p.patience}
        </text>
      ))}
      <text
        x={PAD.l + pw / 2} y={H - 4}
        textAnchor="middle" fill="#475569" fontSize={11}
      >
        Early Stopping Patience
      </text>

      {/* lines + dots */}
      {MODEL_LINE.map(({ key, color }) => {
        const vals = points.map((p) => p[key].ndcg_at_10);
        const bestVal = Math.max(...vals);
        const path = points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${xPos(i)} ${yPos(p[key].ndcg_at_10)}`)
          .join(" ");
        return (
          <g key={key}>
            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            {points.map((p, i) => {
              const v   = p[key].ndcg_at_10;
              const isBest = v === bestVal;
              return (
                <circle
                  key={i}
                  cx={xPos(i)} cy={yPos(v)}
                  r={isBest ? 6 : 4}
                  fill={isBest ? color : "#0a0f1e"}
                  stroke={color} strokeWidth={2}
                />
              );
            })}
          </g>
        );
      })}

      {/* legend */}
      {MODEL_LINE.map(({ key, color, label }, i) => (
        <g key={key} transform={`translate(${PAD.l + i * 130}, 6)`}>
          <line x1={0} y1={6} x2={18} y2={6} stroke={color} strokeWidth={2} />
          <circle cx={9} cy={6} r={3} fill={color} />
          <text x={22} y={10} fill="#94a3b8" fontSize={11}>{label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Metrics() {
  const [metrics,   setMetrics]   = useState(null);
  const [patience,  setPatience]  = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [mRes, pRes] = await Promise.all([
          metricsAPI.getMetrics(),
          metricsAPI.getPatienceSensitivity(),
        ]);
        setMetrics(mRes.data);
        setPatience(pRes.data.points);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const getBest = (metricKey) => {
    if (!metrics) return null;
    return Object.entries(metrics).reduce(
      (best, [model, vals]) =>
        vals[metricKey] > (metrics[best]?.[metricKey] || 0) ? model : best,
      "mf",
    );
  };

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
        style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1
            style={{
              color: "#f1f5f9",
              fontSize: "22px",
              fontWeight: "700",
              margin: "0 0 0.4rem",
            }}
          >
            Evaluation Results
          </h1>
          <p style={{ color: "#475569", fontSize: "13px", margin: 0 }}>
            Offline evaluation on MovieLens 1M dataset · 80/10/10 train/val/test
            split
          </p>
        </div>

        {loading ? (
          <div
            style={{ textAlign: "center", color: "#475569", padding: "5rem 0" }}
          >
            Loading metrics...
          </div>
        ) : metrics ? (
          <>
            {/* Metrics table */}
            <div
              style={{
                background: "rgba(15,23,42,0.85)",
                border: "1px solid rgba(30,41,59,0.8)",
                borderRadius: "12px",
                overflow: "hidden",
                marginBottom: "1.5rem",
              }}
            >
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "0.75rem 1.5rem",
                  borderBottom: "1px solid rgba(30,41,59,0.8)",
                  background: "rgba(30,41,59,0.4)",
                }}
              >
                <div
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  Model
                </div>
                {METRICS.map((m) => (
                  <div
                    key={m.key}
                    style={{
                      color: "#64748b",
                      fontSize: "12px",
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {/* Table rows */}
              {Object.entries(MODEL_CONFIG).map(([key, info]) => {
                const vals = metrics[key];
                if (!vals) return null;
                return (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr",
                      padding: "1rem 1.5rem",
                      borderBottom: "1px solid rgba(30,41,59,0.5)",
                      background:
                        key === "lightgcn"
                          ? "rgba(20,184,166,0.04)"
                          : "transparent",
                    }}
                  >
                    {/* Model name */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: info.color,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div
                          style={{
                            color: info.color,
                            fontSize: "14px",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {info.label}
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
                        <div
                          style={{
                            color: "#475569",
                            fontSize: "11px",
                            marginTop: "2px",
                          }}
                        >
                          {info.desc}
                        </div>
                      </div>
                    </div>

                    {/* Metric values */}
                    {METRICS.map((m) => {
                      const isBest = getBest(m.key) === key;
                      return (
                        <div
                          key={m.key}
                          style={{
                            textAlign: "center",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              color: isBest ? info.color : "#cbd5e1",
                              fontSize: "16px",
                              fontWeight: isBest ? "700" : "400",
                            }}
                          >
                            {vals[m.key]?.toFixed(4)}
                          </span>
                          {/* Bar */}
                          <div
                            style={{
                              width: "80%",
                              height: "4px",
                              background: "rgba(30,41,59,0.8)",
                              borderRadius: "2px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                borderRadius: "2px",
                                width: `${(vals[m.key] / 0.25) * 100}%`,
                                background: isBest
                                  ? info.color
                                  : "rgba(51,65,85,0.8)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Improvement card */}
            {metrics.lightgcn && metrics.mf && (
              <div
                style={{
                  background: "rgba(20,184,166,0.06)",
                  border: "1px solid rgba(20,184,166,0.2)",
                  borderRadius: "12px",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h3
                  style={{
                    color: "#14b8a6",
                    fontSize: "14px",
                    fontWeight: "600",
                    margin: "0 0 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "3px",
                      height: "16px",
                      background: "#14b8a6",
                      borderRadius: "2px",
                    }}
                  />
                  LightGCN Improvement over Baselines
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  {["mf", "ngcf"].map((baseline) => {
                    const bInfo = MODEL_CONFIG[baseline];
                    return (
                      <div
                        key={baseline}
                        style={{
                          background: "rgba(15,23,42,0.6)",
                          borderRadius: "8px",
                          padding: "1rem",
                        }}
                      >
                        <div
                          style={{
                            color: bInfo.color,
                            fontSize: "13px",
                            fontWeight: "600",
                            marginBottom: "0.75rem",
                          }}
                        >
                          vs {bInfo.label}
                        </div>
                        {METRICS.map((m) => {
                          const improvement = (
                            ((metrics.lightgcn[m.key] -
                              metrics[baseline][m.key]) /
                              metrics[baseline][m.key]) *
                            100
                          ).toFixed(1);
                          const positive = improvement > 0;
                          return (
                            <div
                              key={m.key}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "0.4rem",
                              }}
                            >
                              <span
                                style={{ color: "#64748b", fontSize: "12px" }}
                              >
                                {m.label}
                              </span>
                              <span
                                style={{
                                  color: positive ? "#14b8a6" : "#f87171",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                }}
                              >
                                {positive ? "+" : ""}
                                {improvement}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Patience sensitivity */}
            {patience && patience.length > 0 && (
              <div
                style={{
                  background: "rgba(15,23,42,0.85)",
                  border: "1px solid rgba(30,41,59,0.8)",
                  borderRadius: "12px",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h3
                  style={{
                    color: "#f1f5f9",
                    fontSize: "14px",
                    fontWeight: "600",
                    margin: "0 0 0.25rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "3px",
                      height: "16px",
                      background: "#14b8a6",
                      borderRadius: "2px",
                    }}
                  />
                  Early Stopping Patience Sensitivity (NDCG@10)
                </h3>
                <p style={{ color: "#475569", fontSize: "12px", margin: "0 0 1rem" }}>
                  All models trained with identical settings — only patience varies.
                  Filled dot = best per model. Dashed line = chosen value (patience = 10).
                </p>
                <PatienceChart points={patience} />

                {/* Numeric table */}
                <div style={{ overflowX: "auto", marginTop: "1.25rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(30,41,59,0.8)" }}>
                        <th style={{ color: "#64748b", textAlign: "left",   padding: "6px 8px", fontWeight: 600 }}>Patience</th>
                        {MODEL_LINE.map(({ key, color, label }) => (
                          <th key={key} style={{ color, textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {patience.map((p) => (
                        <tr
                          key={p.patience}
                          style={{
                            borderBottom: "1px solid rgba(30,41,59,0.4)",
                            background: p.patience === 10
                              ? "rgba(20,184,166,0.06)"
                              : "transparent",
                          }}
                        >
                          <td style={{ color: p.patience === 10 ? "#14b8a6" : "#94a3b8", padding: "6px 8px", fontWeight: p.patience === 10 ? 700 : 400 }}>
                            {p.patience}{p.patience === 10 ? " ★" : ""}
                          </td>
                          {MODEL_LINE.map(({ key, color }) => (
                            <td key={key} style={{ color, textAlign: "center", padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>
                              {p[key].ndcg_at_10.toFixed(4)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Dataset info */}
            <div
              style={{
                background: "rgba(15,23,42,0.85)",
                border: "1px solid rgba(30,41,59,0.8)",
                borderRadius: "12px",
                padding: "1.5rem",
              }}
            >
              <h3
                style={{
                  color: "#f1f5f9",
                  fontSize: "14px",
                  fontWeight: "600",
                  margin: "0 0 1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    width: "3px",
                    height: "16px",
                    background: "#334155",
                    borderRadius: "2px",
                  }}
                />
                Experimental Setup
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "0.75rem",
                }}
              >
                {[
                  { label: "Dataset", value: "MovieLens 1M" },
                  { label: "Users", value: "6,040" },
                  { label: "Movies", value: "3,706" },
                  { label: "Ratings", value: "1,000,209" },
                  { label: "Split", value: "80% train / 10% val / 10% test" },
                  {
                    label: "Loss function",
                    value: "BPR Loss + Negative Sampling",
                  },
                  { label: "Embedding dim", value: "64" },
                  { label: "GNN layers", value: "3" },
                  { label: "Optimizer", value: "Adam (lr=1e-3)" },
                  { label: "Early stopping", value: "Patience = 10" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: "1px solid rgba(30,41,59,0.5)",
                    }}
                  >
                    <span style={{ color: "#64748b", fontSize: "12px" }}>
                      {label}
                    </span>
                    <span
                      style={{
                        color: "#cbd5e1",
                        fontSize: "12px",
                        fontWeight: "500",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div
            style={{ textAlign: "center", color: "#f87171", padding: "3rem 0" }}
          >
            Failed to load metrics
          </div>
        )}
      </div>
    </div>
  );
}
