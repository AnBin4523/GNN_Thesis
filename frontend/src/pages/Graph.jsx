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

function getCanvasSize(nodeCount) {
  if (nodeCount <= 15) return { W: 1100, H: 700 };
  if (nodeCount <= 25) return { W: 1400, H: 860 };
  return { W: 1600, H: 1000 };
}

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

    users.forEach((n) => {
      pos[n.id] = { x: centerX, y: centerY };
    });

    const movieR = ringRadius(movies.length, 220, 55);
    movies.forEach((n, i) => {
      const angle =
        (i / Math.max(movies.length, 1)) * 2 * Math.PI - Math.PI / 2;
      pos[n.id] = {
        x: centerX + movieR * Math.cos(angle),
        y: centerY + movieR * 0.82 * Math.sin(angle),
      };
    });

    const genreR = ringRadius(genres.length, movieR + 180, 52);
    genres.forEach((n, i) => {
      const angle =
        (i / Math.max(genres.length, 1)) * 2 * Math.PI - Math.PI / 2;
      pos[n.id] = {
        x: centerX + genreR * Math.cos(angle),
        y: centerY + genreR * 0.72 * Math.sin(angle),
      };
    });

    const demoSpacing = Math.max(70, (H - 120) / Math.max(demos.length, 1));
    demos.forEach((n, i) => {
      pos[n.id] = {
        x: 90,
        y: 80 + i * demoSpacing,
      };
    });

    const posArr = { ...pos };
    const REPULSION = 8000;
    const IDEAL_RATED = movieR * 0.95;
    const IDEAL_OTHER = 140;
    const GRAVITY = 0.003;
    const ITERS = nodes.length > 30 ? 300 : 220;
    const PADDING = 70;

    for (let iter = 0; iter < ITERS; iter++) {
      const cool = 1 - iter / ITERS;

      const forces = {};
      nodes.forEach((n) => {
        forces[n.id] = { x: 0, y: 0 };
      });

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

      nodes.forEach((n) => {
        if (n.type === "User") return;
        if (["Gender", "AgeGroup", "Occupation"].includes(n.type)) return;
        forces[n.id].x += (centerX - posArr[n.id].x) * GRAVITY;
        forces[n.id].y += (centerY - posArr[n.id].y) * GRAVITY;
      });

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

const NODE_DESC = {
  User: "Your profile — the starting point for all recommendations",
  Movie: "A film you rated in the ML-1M dataset",
  Genre: "A genre shared by your rated movies",
  Gender: "Your gender (demographic attribute)",
  AgeGroup: "Your age group (demographic attribute)",
  Occupation: "Your occupation (demographic attribute)",
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
  const [nodeTooltip, setNodeTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    text: "",
    subtext: "",
    color: "",
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
    setNodeTooltip({ visible: false, x: 0, y: 0, text: "", subtext: "", color: "" });
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

        {/* ── LAYER 2: Edge labels on hover ── */}
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

          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

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

        {/* ── LAYER 3: Nodes ── */}
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
              onMouseEnter={(e) => {
                if (dragging) return;
                const rect = svgRef.current.getBoundingClientRect();
                setNodeTooltip({
                  visible: true,
                  x: e.clientX - rect.left + 14,
                  y: e.clientY - rect.top - 48,
                  text:
                    node.label.length > 32
                      ? node.label.slice(0, 31) + "…"
                      : node.label,
                  subtext: NODE_DESC[node.type] || node.type,
                  color,
                });
              }}
              onMouseLeave={() =>
                setNodeTooltip({
                  visible: false,
                  x: 0,
                  y: 0,
                  text: "",
                  subtext: "",
                  color: "",
                })
              }
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

      {/* Node hover tooltip */}
      {nodeTooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: nodeTooltip.x,
            top: nodeTooltip.y,
            background: "#1e293b",
            border: `1px solid ${nodeTooltip.color}55`,
            borderRadius: "8px",
            padding: "6px 12px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          <div
            style={{
              color: nodeTooltip.color,
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            {nodeTooltip.text}
          </div>
          <div style={{ color: "#64748b", fontSize: "10px", marginTop: "2px" }}>
            {nodeTooltip.subtext}
          </div>
        </div>
      )}
    </div>
  );
}

function ExplainerCard() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(15,23,42,0.85)",
          border: "1px solid rgba(30,41,59,0.8)",
          borderRadius: open ? "10px 10px 0 0" : "10px",
          padding: "10px 16px",
          cursor: "pointer",
          color: "#94a3b8",
          fontSize: "13px",
          fontWeight: "500",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#14b8a6" strokeWidth="1.5" />
            <path
              d="M12 8v4M12 16h.01"
              stroke="#14b8a6"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          How to read this graph
        </span>
        <span style={{ fontSize: "10px", color: "#475569" }}>
          {open ? "▲ hide" : "▼ show"}
        </span>
      </button>

      {open && (
        <div
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(30,41,59,0.8)",
            borderTop: "none",
            borderRadius: "0 0 10px 10px",
            padding: "1rem",
          }}
        >
          {/* Node type cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            {[
              {
                color: "#14b8a6",
                title: "YOU (center node)",
                desc: "Your user profile — the starting point. LightGCN builds a taste embedding by aggregating signals from all your connected nodes.",
              },
              {
                color: "#6366f1",
                title: "Movies (purple ring)",
                desc: "Films you have rated. Each rating is a direct signal about your preferences — the more ratings, the richer your profile.",
              },
              {
                color: "#f59e0b",
                title: "Genres (amber outer ring)",
                desc: "Categories your rated movies belong to (Action, Drama…). Shared genres between users reveal taste similarity clusters.",
              },
              {
                color: "#8b5cf6",
                title: "Demographics (left panel)",
                desc: "Your age group, gender, and occupation. Used as auxiliary context signals — especially helpful for cold-start users with few ratings.",
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  display: "flex",
                  gap: "10px",
                  padding: "10px 12px",
                  background: "rgba(30,41,59,0.5)",
                  borderRadius: "8px",
                  borderLeft: `3px solid ${item.color}`,
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: item.color,
                    flexShrink: 0,
                    marginTop: "3px",
                  }}
                />
                <div>
                  <div
                    style={{
                      color: item.color,
                      fontSize: "12px",
                      fontWeight: "600",
                      marginBottom: "3px",
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: "11px",
                      lineHeight: "1.45",
                    }}
                  >
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Edge types */}
          <div
            style={{
              borderTop: "1px solid rgba(30,41,59,0.8)",
              paddingTop: "0.75rem",
              marginBottom: "0.875rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "1.25rem",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "#475569",
                fontSize: "11px",
                fontWeight: "500",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Edges (relationships):
            </span>
            {[
              {
                color: "#6366f1",
                label: "RATED",
                desc: "you rated this movie",
              },
              {
                color: "#f59e0b",
                label: "IN_GENRE",
                desc: "movie belongs to this genre",
              },
              {
                color: "#94a3b8",
                label: "HAS_GENDER / AGE / OCCUPATION",
                desc: "demographic attributes",
              },
            ].map((e) => (
              <div
                key={e.label}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <svg width="24" height="8" viewBox="0 0 24 8">
                  <line
                    x1="0"
                    y1="4"
                    x2="18"
                    y2="4"
                    stroke={e.color}
                    strokeWidth="1.5"
                    strokeOpacity="0.8"
                  />
                  <polygon
                    points="16,1 24,4 16,7"
                    fill={e.color}
                    fillOpacity="0.8"
                  />
                </svg>
                <span style={{ color: "#64748b", fontSize: "11px" }}>
                  <span style={{ color: e.color, fontWeight: "500" }}>
                    {e.label}
                  </span>{" "}
                  — {e.desc}
                </span>
              </div>
            ))}
          </div>

          {/* How GNN uses this */}
          <div
            style={{
              background: "rgba(20,184,166,0.05)",
              border: "1px solid rgba(20,184,166,0.15)",
              borderRadius: "8px",
              padding: "10px 14px",
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              style={{ flexShrink: 0, marginTop: "1px" }}
            >
              <path
                d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                stroke="#14b8a6"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <div
                style={{
                  color: "#14b8a6",
                  fontSize: "11px",
                  fontWeight: "600",
                  marginBottom: "4px",
                }}
              >
                How LightGCN uses this graph
              </div>
              <div
                style={{ color: "#64748b", fontSize: "11px", lineHeight: "1.5" }}
              >
                LightGCN propagates information along each edge — your ratings
                "flow" through movies into genres, and those genre signals "flow"
                back to refine your taste embedding. After several propagation
                hops, the model ranks every unseen movie by comparing your final
                embedding with each movie&apos;s embedding — closer distance =
                higher recommendation rank.
              </div>
            </div>
          </div>
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
      if (ml1mUserId == null) return;
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

        {/* Explainer — collapsible */}
        <ExplainerCard />

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
            padding: "0.875rem 1rem",
          }}
        >
          {/* Node types */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.875rem",
              alignItems: "center",
              marginBottom: "0.625rem",
            }}
          >
            <span
              style={{
                color: "#475569",
                fontSize: "11px",
                fontWeight: "500",
                minWidth: "fit-content",
              }}
            >
              Nodes:
            </span>
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div
                key={type}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <div
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: color,
                  }}
                />
                <span style={{ color: "#94a3b8", fontSize: "11px" }}>
                  {type}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(30,41,59,0.8)",
              marginBottom: "0.625rem",
            }}
          />

          {/* Edge types */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.875rem",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "#475569",
                fontSize: "11px",
                fontWeight: "500",
                minWidth: "fit-content",
              }}
            >
              Edges:
            </span>
            {[
              { type: "RATED", color: "#6366f1" },
              { type: "IN_GENRE", color: "#f59e0b" },
              { type: "HAS_GENDER", color: "#ec4899" },
              { type: "HAS_AGE", color: "#8b5cf6" },
              { type: "HAS_OCCUPATION", color: "#06b6d4" },
            ].map(({ type, color }) => (
              <div
                key={type}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <svg width="18" height="6" viewBox="0 0 18 6">
                  <line
                    x1="0"
                    y1="3"
                    x2="13"
                    y2="3"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeOpacity="0.8"
                  />
                  <polygon
                    points="11,0.5 18,3 11,5.5"
                    fill={color}
                    fillOpacity="0.8"
                  />
                </svg>
                <span style={{ color: "#64748b", fontSize: "11px" }}>
                  {type}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}