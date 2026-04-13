import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

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

const NAV_LINKS = [
  { path: "/recommend", label: "Recommend" },
  { path: "/compare", label: "Compare" },
  { path: "/graph", label: "Graph" },
  { path: "/metrics", label: "Metrics" },
];

export default function Navbar({ activeGenre, onGenreChange }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUser, setShowUser] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(10,15,30,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(20,184,166,0.15)",
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "0 1.5rem",
          height: "60px",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              background: "#14b8a6",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
              fontSize: "17px",
              fontWeight: "700",
              color: "#f1f5f9",
              letterSpacing: "-0.3px",
            }}
          >
            GNN<span style={{ color: "#14b8a6" }}>MOVIE</span>
          </span>
        </Link>

        {/* Nav links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            flex: 1,
          }}
        >
          {NAV_LINKS.map(({ path, label }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: "500",
                  color: active ? "#14b8a6" : "#94a3b8",
                  background: active ? "rgba(20,184,166,0.1)" : "transparent",
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = "#cbd5e1";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = "#94a3b8";
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* User menu */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowUser(!showUser)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(30,41,59,0.8)",
              border: "1px solid rgba(20,184,166,0.2)",
              borderRadius: "8px",
              padding: "6px 12px",
              color: "#f1f5f9",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                background: "#14b8a6",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: "700",
                color: "#0a0f1e",
              }}
            >
              {user?.display_name?.[0]?.toUpperCase() || "U"}
            </div>
            <span>{user?.display_name || "User"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9l6 6 6-6"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {showUser && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                background: "#1e293b",
                border: "1px solid rgba(20,184,166,0.2)",
                borderRadius: "10px",
                padding: "0.5rem",
                minWidth: "160px",
                zIndex: 200,
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid rgba(51,65,85,0.5)",
                  marginBottom: "4px",
                }}
              >
                <div
                  style={{
                    color: "#f1f5f9",
                    fontSize: "13px",
                    fontWeight: "500",
                  }}
                >
                  {user?.display_name}
                </div>
              </div>
              <Link
                to="/profile"
                onClick={() => setShowUser(false)}
                style={{
                  display: "block",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  color: "#94a3b8",
                  fontSize: "13px",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(20,184,166,0.1)";
                  e.currentTarget.style.color = "#14b8a6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#94a3b8";
                }}
              >
                Profile
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "transparent",
                  border: "none",
                  color: "#f87171",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(239,68,68,0.1)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Genre filter bar ── */}
      <div
        style={{
          borderTop: "1px solid rgba(30,41,59,0.8)",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            padding: "0.6rem 1.5rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", width: "max-content" }}>
            {/* All */}
            <button
              onClick={() => onGenreChange && onGenreChange(null)}
              style={{
                padding: "5px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: "500",
                border: !activeGenre
                  ? "1px solid #14b8a6"
                  : "1px solid rgba(51,65,85,0.8)",
                background: !activeGenre
                  ? "rgba(20,184,166,0.15)"
                  : "rgba(30,41,59,0.5)",
                color: !activeGenre ? "#14b8a6" : "#64748b",
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              All
            </button>

            {GENRES.map((genre) => {
              const active = activeGenre === genre;
              return (
                <button
                  key={genre}
                  onClick={() => onGenreChange && onGenreChange(genre)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: "500",
                    border: active
                      ? "1px solid #14b8a6"
                      : "1px solid rgba(51,65,85,0.8)",
                    background: active
                      ? "rgba(20,184,166,0.15)"
                      : "rgba(30,41,59,0.5)",
                    color: active ? "#14b8a6" : "#64748b",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.borderColor =
                        "rgba(20,184,166,0.4)";
                      e.currentTarget.style.color = "#94a3b8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.borderColor = "rgba(51,65,85,0.8)";
                      e.currentTarget.style.color = "#64748b";
                    }
                  }}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
