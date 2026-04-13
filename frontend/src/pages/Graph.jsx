import { useState, useEffect, useRef } from "react";
import Navbar from "../components/common/Navbar";
import { useAuth } from "../context/AuthContext";
import { graphAPI } from "../api/index";

const NODE_COLORS = {
  User: "#14b8a6",
  Movie: "#6366f1",
  Genre: "#f59e0b",
  Gender: "#ec4899",
  AgeGroup: "#8b5cf6",
  Occupation: "#06b6d4",
};

const NODE_RADIUS = {
  User: 22,
  Movie: 14,
  Genre: 11,
  Gender: 11,
  AgeGroup: 11,
  Occupation: 11,
};

const W = 1100;
const H = 650;

function useForceLayout(nodes, edges) {
  const [positions, setPositions] = useState({});

  useEffect(() => {
    if (!nodes.length) return;

    const pos = {};
    const centerX = W / 2;
    const centerY = H / 2;

    // Separate nodes by type
    const movies = nodes.filter((n) => n.type === "Movie");
    const genres = nodes.filter((n) => n.type === "Genre");
    const demos = nodes.filter((n) =>
      ["Gender", "AgeGroup", "Occupation"].includes(n.type),
    );
    const users = nodes.filter((n) => n.type === "User");

    // User → center
    users.forEach((n) => {
      pos[n.id] = { x: centerX, y: centerY };
    });

    // Movies → inner ring
    movies.forEach((n, i) => {
      const angle =
        (i / Math.max(movies.length, 1)) * 2 * Math.PI - Math.PI / 2;
      pos[n.id] = {
        x: centerX + 220 * Math.cos(angle),
        y: centerY + 180 * Math.sin(angle),
      };
    });

    // Genres → outer ring
    genres.forEach((n, i) => {
      const angle =
        (i / Math.max(genres.length, 1)) * 2 * Math.PI - Math.PI / 2;
      pos[n.id] = {
        x: centerX + 420 * Math.cos(angle),
        y: centerY + 280 * Math.sin(angle),
      };
    });

    // Demographics → left side
    demos.forEach((n, i) => {
      pos[n.id] = {
        x: 100 + (i % 2) * 120,
        y: centerY - 60 + i * 60,
      };
    });

    // Run force simulation
    const posArr = { ...pos };
    for (let iter = 0; iter < 150; iter++) {
      const forces = {};
      nodes.forEach((n) => {
        forces[n.id] = { x: 0, y: 0 };
      });

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          const dx = posArr[a.id].x - posArr[b.id].x;
          const dy = posArr[a.id].y - posArr[b.id].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 1) continue;
          const d = Math.sqrt(d2);
          const f = Math.min(2500 / d2, 50);
          forces[a.id].x += (dx / d) * f;
          forces[a.id].y += (dy / d) * f;
          forces[b.id].x -= (dx / d) * f;
          forces[b.id].y -= (dy / d) * f;
        }
      }

      // Attraction along edges
      edges.forEach((edge) => {
        const a = posArr[edge.source];
        const b = posArr[edge.target];
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = edge.type === "RATED" ? 240 : 160;
        const f = ((d - ideal) / d) * 0.04;
        forces[edge.source].x += dx * f;
        forces[edge.source].y += dy * f;
        forces[edge.target].x -= dx * f;
        forces[edge.target].y -= dy * f;
      });

      // Center gravity (weak)
      nodes.forEach((n) => {
        if (n.type === "User") return;
        forces[n.id].x += (centerX - posArr[n.id].x) * 0.005;
        forces[n.id].y += (centerY - posArr[n.id].y) * 0.005;
      });

      // Apply forces
      nodes.forEach((n) => {
        if (n.type === "User") return; // keep user fixed at center
        posArr[n.id].x = Math.max(
          60,
          Math.min(W - 60, posArr[n.id].x + forces[n.id].x),
        );
        posArr[n.id].y = Math.max(
          60,
          Math.min(H - 60, posArr[n.id].y + forces[n.id].y),
        );
      });
    }

    setPositions({ ...posArr });
  }, [nodes.length, edges.length]);

  return positions;
}

function GraphCanvas({ nodes, edges }) {
  const svgRef = useRef(null);
  const basePositions = useForceLayout(nodes, edges);
  const [positions, setPositions] = useState({});
  const [dragging, setDragging] = useState(null);
  const dragRef = useRef({ offsetX: 0, offsetY: 0 });

  useEffect(() => {
    setPositions({ ...basePositions });
  }, [basePositions]);

  const getSVGPoint = (clientX, clientY) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e, nodeId) => {
    e.preventDefault();
    const pt = getSVGPoint(e.clientX, e.clientY);
    dragRef.current = {
      offsetX: pt.x - (positions[nodeId]?.x || 0),
      offsetY: pt.y - (positions[nodeId]?.y || 0),
    };
    setDragging(nodeId);
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const pt = getSVGPoint(e.clientX, e.clientY);
    setPositions((prev) => ({
      ...prev,
      [dragging]: {
        x: Math.max(60, Math.min(W - 60, pt.x - dragRef.current.offsetX)),
        y: Math.max(60, Math.min(H - 60, pt.y - dragRef.current.offsetY)),
      },
    }));
  };

  if (!Object.keys(positions).length)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "560px",
          color: "#475569",
        }}
      >
        Building graph layout...
      </div>
    );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: "100%",
        height: "560px",
        cursor: dragging ? "grabbing" : "default",
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const a = positions[edge.source];
        const b = positions[edge.target];
        if (!a || !b) return null;
        const color =
          edge.type === "RATED"
            ? "#6366f1"
            : edge.type === "IN_GENRE"
              ? "#f59e0b"
              : edge.type === "HAS_GENDER"
                ? "#ec4899"
                : edge.type === "HAS_AGE"
                  ? "#8b5cf6"
                  : edge.type === "HAS_OCCUPATION"
                    ? "#06b6d4"
                    : "#334155";
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={color}
            strokeWidth="1"
            strokeOpacity="0.3"
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = positions[node.id];
        if (!pos) return null;
        const color = NODE_COLORS[node.type] || "#64748b";
        const radius = NODE_RADIUS[node.type] || 10;
        const label =
          node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label;

        return (
          <g
            key={node.id}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
            style={{ cursor: "grab" }}
          >
            {node.type === "User" && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius + 7}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeOpacity="0.2"
              />
            )}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={radius}
              fill={color}
              fillOpacity="0.85"
              stroke="#0a0f1e"
              strokeWidth="1.5"
            />
            <text
              x={pos.x}
              y={pos.y + radius + 13}
              textAnchor="middle"
              fontSize={node.type === "User" ? "12" : "9"}
              fontWeight={node.type === "User" ? "600" : "400"}
              fill={node.type === "User" ? "#14b8a6" : "#94a3b8"}
              style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Graph() {
  const { user } = useAuth();

  const [subgraph, setSubgraph] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [movieLimit, setMovieLimit] = useState(10);

  const ml1mUserId = user?.ml1m_user_id;

  useEffect(() => {
    const fetchData = async () => {
      if (!ml1mUserId) return;
      setLoading(true);
      try {
        const [sgRes, stRes] = await Promise.all([
          graphAPI.getSubgraph(ml1mUserId, movieLimit),
          graphAPI.getStats(),
        ]);
        setSubgraph(sgRes.data);
        setStats(stRes.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ml1mUserId, movieLimit]);

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
        style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h1
              style={{
                color: "#f1f5f9",
                fontSize: "22px",
                fontWeight: "700",
                margin: "0 0 0.4rem",
              }}
            >
              Knowledge Graph
            </h1>
            <p style={{ color: "#475569", fontSize: "13px", margin: 0 }}>
              Subgraph for ML-1M User #{ml1mUserId} — drag nodes to explore
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "#64748b", fontSize: "13px" }}>Movies</span>
            {[5, 10, 15].map((val) => (
              <button
                key={val}
                onClick={() => setMovieLimit(val)}
                style={{
                  width: "36px",
                  height: "32px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  border:
                    movieLimit === val
                      ? "1px solid #14b8a6"
                      : "1px solid rgba(51,65,85,0.8)",
                  background:
                    movieLimit === val
                      ? "rgba(20,184,166,0.1)"
                      : "rgba(30,41,59,0.5)",
                  color: movieLimit === val ? "#14b8a6" : "#64748b",
                  cursor: "pointer",
                }}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {[
              { label: "Users", value: stats.num_users?.toLocaleString() },
              { label: "Movies", value: stats.num_movies?.toLocaleString() },
              { label: "Genres", value: stats.num_genres?.toLocaleString() },
              { label: "Ratings", value: stats.num_ratings?.toLocaleString() },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: "rgba(15,23,42,0.85)",
                  border: "1px solid rgba(30,41,59,0.8)",
                  borderRadius: "10px",
                  padding: "1rem",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    color: "#14b8a6",
                    fontSize: "18px",
                    fontWeight: "700",
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    color: "#475569",
                    fontSize: "12px",
                    marginTop: "2px",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(30,41,59,0.8)",
            borderRadius: "12px",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "560px",
                color: "#475569",
              }}
            >
              Loading graph...
            </div>
          ) : subgraph ? (
            <GraphCanvas nodes={subgraph.nodes} edges={subgraph.edges} />
          ) : (
            <div
              style={{ textAlign: "center", color: "#f87171", padding: "3rem" }}
            >
              Failed to load graph
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(30,41,59,0.8)",
            borderRadius: "10px",
            padding: "1rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <span
            style={{ color: "#475569", fontSize: "12px", fontWeight: "500" }}
          >
            Node types:
          </span>
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div
              key={type}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: color,
                }}
              />
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
