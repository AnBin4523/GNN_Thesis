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

// Canvas size scales with node count
function getCanvasSize(nodeCount) {
  if (nodeCount <= 15) return { W: 1100, H: 700 };
  if (nodeCount <= 25) return { W: 1400, H: 860 };
  return { W: 1600, H: 1000 };
}

// Ring radius scales with number of items on that ring
function ringRadius(count, minR, perItemR) {
  return Math.max(minR, (count * perItemR) / (2 * Math.PI));
}

function useForceLayout(nodes, edges) {
  const [positions, setPositions] = useState({});
  const [canvasSize, setCanvasSize] = useState({ W: 1100, H: 700 });

  useEffect(() => {
    if (!nodes.length) return;

    const { W, H } = getCanvasSize(nodes.length);
    setCanvasSize({ W, H });

    const pos = {};
    const centerX = W / 2;
    const centerY = H / 2;

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

    // Movies → inner ring — radius grows with count so nodes don't overlap
    const movieR = ringRadius(movies.length, 220, 55);
    movies.forEach((n, i) => {
      const angle =
        (i / Math.max(movies.length, 1)) * 2 * Math.PI - Math.PI / 2;
      pos[n.id] = {
        x: centerX + movieR * Math.cos(angle),
        y: centerY + movieR * 0.82 * Math.sin(angle),
      };
    });

    // Genres → outer ring
    const genreR = ringRadius(genres.length, movieR + 180, 52);
    genres.forEach((n, i) => {
      const angle =
        (i / Math.max(genres.length, 1)) * 2 * Math.PI - Math.PI / 2;
      pos[n.id] = {
        x: centerX + genreR * Math.cos(angle),
        y: centerY + genreR * 0.72 * Math.sin(angle),
      };
    });

    // Demographics → left side, evenly spaced vertically
    const demoSpacing = Math.max(70, (H - 120) / Math.max(demos.length, 1));
    demos.forEach((n, i) => {
      pos[n.id] = {
        x: 90,
        y: 80 + i * demoSpacing,
      };
    });

    // Force simulation — stronger repulsion, more iterations for larger graphs
    const posArr = { ...pos };
    const REPULSION = 8000;
    const IDEAL_RATED = movieR * 0.95;
    const IDEAL_OTHER = 140;
    const GRAVITY = 0.003;
    const ITERS = nodes.length > 30 ? 300 : 220;
    const PADDING = 70;

    for (let iter = 0; iter < ITERS; iter++) {
      // Cooling factor — slow down over time for stability
      const cool = 1 - iter / ITERS;

      const forces = {};
      nodes.forEach((n) => {
        forces[n.id] = { x: 0, y: 0 };
      });

      // Repulsion between every pair
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          const dx = posArr[a.id].x - posArr[b.id].x;
          const dy = posArr[a.id].y - posArr[b.id].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 1) continue;
          const d = Math.sqrt(d2);
          const f = Math.min(REPULSION / d2, 80);
          forces[a.id].x += (dx / d) * f;
          forces[a.id].y += (dy / d) * f;
          forces[b.id].x -= (dx / d) * f;
          forces[b.id].y -= (dy / d) * f;
        }
      }

      // Spring attraction along edges
      edges.forEach((edge) => {
        const a = posArr[edge.source];
        const b = posArr[edge.target];
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = edge.type === "RATED" ? IDEAL_RATED : IDEAL_OTHER;
        const f = ((d - ideal) / d) * 0.035;
        forces[edge.source].x += dx * f;
        forces[edge.source].y += dy * f;
        forces[edge.target].x -= dx * f;
        forces[edge.target].y -= dy * f;
      });

      // Weak gravity toward center (skip demographics — pinned left)
      nodes.forEach((n) => {
        if (n.type === "User") return;
        if (["Gender", "AgeGroup", "Occupation"].includes(n.type)) return;
        forces[n.id].x += (centerX - posArr[n.id].x) * GRAVITY;
        forces[n.id].y += (centerY - posArr[n.id].y) * GRAVITY;
      });

      // Apply with cooling
      nodes.forEach((n) => {
        if (n.type === "User") return;
        posArr[n.id].x = Math.max(
          PADDING,
          Math.min(W - PADDING, posArr[n.id].x + forces[n.id].x * cool),
        );
        posArr[n.id].y = Math.max(
          PADDING,
          Math.min(H - PADDING, posArr[n.id].y + forces[n.id].y * cool),
        );
      });
    }

    setPositions({ ...posArr });
  }, [nodes.length, edges.length]);

  return { positions, canvasSize };
}

const EDGE_LABEL = {
  RATED: "RATED",
  IN_GENRE: "IN_GENRE",
  HAS_GENDER: "HAS_GENDER",
  HAS_AGE: "HAS_AGE",
  HAS_OCCUPATION: "HAS_OCCUPATION",
};

function GraphCanvas({ nodes, edges }) {
  const svgRef = useRef(null);
  const { positions: basePositions, canvasSize } = useForceLayout(nodes, edges);
  const { W, H } = canvasSize;
  const [positions, setPositions] = useState({});
  const [dragging, setDragging] = useState(null);
  const dragRef = useRef({ offsetX: 0, offsetY: 0 });
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    text: "",
  });

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
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: "100%",
          height: "auto",
          minHeight: "560px",
          cursor: dragging ? "grabbing" : "default",
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        {/* Arrow marker defs */}
        <defs>
          {["RATED", "IN_GENRE", "HAS_GENDER", "HAS_AGE", "HAS_OCCUPATION"].map(
            (type) => {
              const color =
                type === "RATED"
                  ? "#6366f1"
                  : type === "IN_GENRE"
                    ? "#f59e0b"
                    : type === "HAS_GENDER"
                      ? "#ec4899"
                      : type === "HAS_AGE"
                        ? "#8b5cf6"
                        : "#06b6d4";
              return (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill={color} fillOpacity="0.7" />
                </marker>
              );
            },
          )}
        </defs>

        {/* ── LAYER 1: Edge lines ── */}
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

          const srcNode = nodes.find((n) => n.id === edge.source);
          const tgtNode = nodes.find((n) => n.id === edge.target);
          const rSrc = srcNode ? NODE_RADIUS[srcNode.type] || 10 : 10;
          const rTgt = tgtNode ? NODE_RADIUS[tgtNode.type] || 10 : 10;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          // Start/end points trimmed to node circumference
          const x1 = a.x + (dx / dist) * rSrc;
          const y1 = a.y + (dy / dist) * rSrc;
          const x2 = b.x - (dx / dist) * (rTgt + 7);
          const y2 = b.y - (dy / dist) * (rTgt + 7);

          const isHovered = hoveredEdge === i;

          const labelText =
            edge.type === "RATED" && edge.properties?.rating
              ? `RATED (${edge.properties.rating}★)`
              : EDGE_LABEL[edge.type] || edge.type;

          return (
            <g key={i}>
              {/* Invisible hit area */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth="14"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  setHoveredEdge(i);
                  const svg = svgRef.current;
                  const rect = svg.getBoundingClientRect();
                  setTooltip({
                    visible: true,
                    x: e.clientX - rect.left + 12,
                    y: e.clientY - rect.top - 28,
                    text: labelText,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredEdge(null);
                  setTooltip({ visible: false, x: 0, y: 0, text: "" });
                }}
              />
              {/* Visible line */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={isHovered ? "2" : "1"}
                strokeOpacity={isHovered ? "0.9" : "0.3"}
                markerEnd={`url(#arrow-${edge.type})`}
                style={{ pointerEvents: "none" }}
              />
            </g>
          );
        })}

        {/* ── LAYER 2: Edge labels — perpendicular offset, only on hover ── */}
        {edges.map((edge, i) => {
          if (hoveredEdge !== i) return null;
          const a = positions[edge.source];
          const b = positions[edge.target];
          if (!a || !b) return null;

          const srcNode = nodes.find((n) => n.id === edge.source);
          const tgtNode = nodes.find((n) => n.id === edge.target);
          const rSrc = srcNode ? NODE_RADIUS[srcNode.type] || 10 : 10;
          const rTgt = tgtNode ? NODE_RADIUS[tgtNode.type] || 10 : 10;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const x1 = a.x + (dx / dist) * rSrc;
          const y1 = a.y + (dy / dist) * rSrc;
          const x2 = b.x - (dx / dist) * (rTgt + 7);
          const y2 = b.y - (dy / dist) * (rTgt + 7);

          // Midpoint of the trimmed line
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          // Perpendicular unit vector (rotate 90°) — offset label sideways
          const nx = -dy / dist;
          const ny = dx / dist;
          const OFFSET = 14;
          const lx = midX + nx * OFFSET;
          const ly = midY + ny * OFFSET;

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

          const labelText =
            edge.type === "RATED" && edge.properties?.rating
              ? `RATED (${edge.properties.rating}★)`
              : EDGE_LABEL[edge.type] || edge.type;

          return (
            <g key={`lbl-${i}`} style={{ pointerEvents: "none" }}>
              {/* Label background pill */}
              <rect
                x={lx - 36}
                y={ly - 9}
                width="72"
                height="16"
                rx="4"
                fill="#0f172a"
                fillOpacity="0.82"
              />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="500"
                fill={color}
                style={{ userSelect: "none" }}
              >
                {labelText}
              </text>
            </g>
          );
        })}

        {/* ── LAYER 3: Nodes — always on top ── */}
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

      {/* Edge hover tooltip */}
      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "11px",
            color: "#e2e8f0",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
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
