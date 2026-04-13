import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { movieAPI } from "../api/index";

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTrailer, setShowTrailer] = useState(false);

  useEffect(() => {
    const fetchMovie = async () => {
      setLoading(true);
      try {
        const res = await movieAPI.getMovie(Number(id));
        setMovie(res.data);
      } catch {
        setError("Movie not found");
      } finally {
        setLoading(false);
      }
    };
    fetchMovie();
  }, [id]);

  if (loading)
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
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
          }}
        >
          <div style={{ color: "#475569", fontSize: "14px" }}>Loading...</div>
        </div>
      </div>
    );

  if (error || !movie)
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
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
            gap: "1rem",
          }}
        >
          <div style={{ color: "#f87171", fontSize: "14px" }}>
            {error || "Movie not found"}
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "rgba(20,184,166,0.1)",
              border: "1px solid rgba(20,184,166,0.3)",
              borderRadius: "8px",
              padding: "8px 16px",
              color: "#14b8a6",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Go back
          </button>
        </div>
      </div>
    );

  const poster = movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null;
  const genres = Array.isArray(movie.genres)
    ? movie.genres
    : typeof movie.genres === "string"
      ? movie.genres.split(",").map((g) => g.trim())
      : [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <Navbar />

      {/* Trailer Modal */}
      {showTrailer && movie.trailer_key && (
        <div
          onClick={() => setShowTrailer(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: "100%", maxWidth: "900px" }}
          >
            <button
              onClick={() => setShowTrailer(false)}
              style={{
                position: "absolute",
                top: "-40px",
                right: 0,
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Close
            </button>
            <div
              style={{
                position: "relative",
                paddingTop: "56.25%",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <iframe
                src={`https://www.youtube.com/embed/${movie.trailer_key}?autoplay=1`}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={`${movie.title} Trailer`}
              />
            </div>
          </div>
        </div>
      )}

      <div
        style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "transparent",
            border: "none",
            color: "#64748b",
            fontSize: "13px",
            cursor: "pointer",
            marginBottom: "1.5rem",
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#14b8a6")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M19 12H5M5 12l7 7M5 12l7-7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Back
        </button>

        {/* Main layout */}
        <div
          style={{ display: "flex", gap: "2.5rem", alignItems: "flex-start" }}
        >
          {/* Poster + Watch Trailer */}
          <div style={{ flexShrink: 0, width: "260px" }}>
            <div
              style={{
                borderRadius: "12px",
                overflow: "hidden",
                background: "#1e293b",
                border: "1px solid rgba(20,184,166,0.15)",
                aspectRatio: "2/3",
              }}
            >
              {poster ? (
                <img
                  src={poster}
                  alt={movie.title}
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
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
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

            {/* Watch Trailer button */}
            {movie.trailer_key ? (
              <button
                onClick={() => setShowTrailer(true)}
                style={{
                  width: "100%",
                  marginTop: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  background: "#14b8a6",
                  color: "#0a0f1e",
                  border: "none",
                  borderRadius: "8px",
                  padding: "11px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#0d9488")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#14b8a6")
                }
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
                </svg>
                Watch Trailer
              </button>
            ) : (
              <div
                style={{
                  width: "100%",
                  marginTop: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(30,41,59,0.5)",
                  border: "1px solid rgba(51,65,85,0.5)",
                  borderRadius: "8px",
                  padding: "11px",
                  color: "#334155",
                  fontSize: "13px",
                }}
              >
                No trailer available
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                color: "#f1f5f9",
                fontSize: "28px",
                fontWeight: "700",
                margin: "0 0 0.75rem",
                lineHeight: 1.2,
              }}
            >
              {movie.title}
            </h1>

            {/* Meta */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
                flexWrap: "wrap",
              }}
            >
              {movie.year_published && (
                <span
                  style={{
                    background: "rgba(20,184,166,0.1)",
                    border: "1px solid rgba(20,184,166,0.3)",
                    borderRadius: "6px",
                    padding: "3px 10px",
                    color: "#14b8a6",
                    fontSize: "13px",
                    fontWeight: "500",
                  }}
                >
                  {movie.year_published}
                </span>
              )}
            </div>

            {/* Genres */}
            {genres.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                {genres.map((g) => (
                  <span
                    key={g}
                    style={{
                      background: "rgba(30,41,59,0.8)",
                      border: "1px solid rgba(51,65,85,0.8)",
                      borderRadius: "20px",
                      padding: "4px 12px",
                      color: "#94a3b8",
                      fontSize: "12px",
                    }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Plot */}
            {movie.plot && (
              <div style={{ marginBottom: "1.5rem" }}>
                <h3
                  style={{
                    color: "#64748b",
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    margin: "0 0 0.5rem",
                  }}
                >
                  Overview
                </h3>
                <p
                  style={{
                    color: "#cbd5e1",
                    fontSize: "14px",
                    lineHeight: "1.7",
                    margin: 0,
                  }}
                >
                  {movie.plot}
                </p>
              </div>
            )}

            {/* Director + Cast */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
              }}
            >
              {movie.directors && (
                <div>
                  <h3
                    style={{
                      color: "#64748b",
                      fontSize: "11px",
                      fontWeight: "600",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      margin: "0 0 0.4rem",
                    }}
                  >
                    Director
                  </h3>
                  <p style={{ color: "#f1f5f9", fontSize: "14px", margin: 0 }}>
                    {movie.directors}
                  </p>
                </div>
              )}
              {movie.actors && (
                <div>
                  <h3
                    style={{
                      color: "#64748b",
                      fontSize: "11px",
                      fontWeight: "600",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      margin: "0 0 0.4rem",
                    }}
                  >
                    Cast
                  </h3>
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "14px",
                      margin: 0,
                      lineHeight: "1.5",
                    }}
                  >
                    {movie.actors}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
