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

export default function Metrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await metricsAPI.getMetrics();
        setMetrics(res.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
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
