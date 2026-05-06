import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { movieAPI, ratingAPI } from "../api/index";
import { useAuth } from "../context/AuthContext";

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// ── Star Rating Component ──
function StarRating({ userRating, onRate, disabled }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hovered || userRating || 0);
        return (
          <svg
            key={star}
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill={filled ? "#f59e0b" : "none"}
            stroke={filled ? "#f59e0b" : "#475569"}
            strokeWidth="1.5"
            style={{
              cursor: disabled ? "default" : "pointer",
              transition: "all 0.1s",
            }}
            onMouseEnter={() => !disabled && setHovered(star)}
            onMouseLeave={() => !disabled && setHovered(0)}
            onClick={() => !disabled && onRate(star)}
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        );
      })}
      {userRating > 0 && !disabled && (
        <button
          onClick={() => onRate(0)}
          style={{
            marginLeft: "6px",
            background: "transparent",
            border: "none",
            color: "#475569",
            fontSize: "11px",
            cursor: "pointer",
            padding: "0",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          remove
        </button>
      )}
    </div>
  );
}

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTrailer, setShowTrailer] = useState(false);

  // Rating state
  const [userRating, setUserRating] = useState(0);
  const [avgRating, setAvgRating] = useState(null);
  const [totalRatings, setTotalRatings] = useState(0);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [mappingUpdated, setMappingUpdated] = useState(false);

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

  // Fetch rating info when movie + user loaded
  useEffect(() => {
    if (!movie || !user?.user_id) return;
    const fetchRating = async () => {
      try {
        const res = await ratingAPI.getRating(movie.movie_id, user.user_id);
        setUserRating(res.data.user_rating || 0);
        setAvgRating(res.data.avg_rating);
        setTotalRatings(res.data.total_ratings);
      } catch {
        // ignore — not rated yet
      }
    };
    fetchRating();
  }, [movie, user]);

  const handleRate = async (star) => {
    if (!user?.user_id) return;

    // Optimistic update — cập nhật UI ngay, không chờ API
    const prevRating = userRating;
    const prevAvg = avgRating;
    const prevTotal = totalRatings;

    setUserRating(star);
    if (star === 0) {
      // Remove: tính lại avg tạm thời
      if (prevTotal > 1) {
        setAvgRating(
          parseFloat(
            (((prevAvg || 0) * prevTotal - prevRating) / (prevTotal - 1)).toFixed(1),
          ),
        );
      } else {
        setAvgRating(null);
      }
      setTotalRatings((prev) => Math.max(0, prev - 1));
    } else if (!prevRating) {
      // First rating
      setAvgRating(
        parseFloat(
          (((prevAvg || 0) * prevTotal + star) / (prevTotal + 1)).toFixed(1),
        ),
      );
      setTotalRatings((prev) => prev + 1);
    } else {
      // Update existing rating
      setAvgRating(
        parseFloat(
          (((prevAvg || 0) * prevTotal - prevRating + star) / prevTotal).toFixed(1),
        ),
      );
    }

    setRatingLoading(true);
    setMappingUpdated(false);
    try {
      if (star === 0) {
        await ratingAPI.unrateMovie(movie.movie_id, user.user_id);
      } else {
        const res = await ratingAPI.rateMovie(movie.movie_id, user.user_id, star);
        if (res.data.mapping_source === "rating" && res.data.ml1m_user_id != null) {
          updateUser({ ml1m_user_id: res.data.ml1m_user_id });
          setMappingUpdated(true);
          setTimeout(() => setMappingUpdated(false), 4000);
        }
      }
    } catch {
      // rateMovie có thể lỗi 500 do side-effect (vd: mapping) nhưng rating vẫn đã
      // được lưu vào DB — không revert ngay, để getRating bên dưới xác nhận.
    } finally {
      // Luôn sync lại từ server để hiển thị số chính xác
      try {
        const statsRes = await ratingAPI.getRating(movie.movie_id, user.user_id);
        setUserRating(statsRes.data.user_rating || 0);
        setAvgRating(statsRes.data.avg_rating);
        setTotalRatings(statsRes.data.total_ratings);
      } catch {
        // getRating cũng lỗi → revert optimistic update
        setUserRating(prevRating);
        setAvgRating(prevAvg);
        setTotalRatings(prevTotal);
      }
      setRatingLoading(false);
    }
  };

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

            {/* ── Rating section ── */}
            <div
              style={{
                background: "rgba(15,23,42,0.85)",
                border: "1px solid rgba(30,41,59,0.8)",
                borderRadius: "10px",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              {/* Community stats */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="#f59e0b"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span
                    style={{
                      color: "#f1f5f9",
                      fontSize: "15px",
                      fontWeight: "600",
                    }}
                  >
                    {avgRating ? avgRating.toFixed(1) : "—"}
                  </span>
                  <span style={{ color: "#475569", fontSize: "12px" }}>
                    {totalRatings > 0
                      ? `(${totalRatings} rating${totalRatings > 1 ? "s" : ""})`
                      : "No ratings yet"}
                  </span>
                </div>
              </div>

              {/* User rating */}
              {user ? (
                <div>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: "11px",
                      fontWeight: "600",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Your Rating
                  </div>
                  <StarRating
                    userRating={userRating}
                    onRate={handleRate}
                    disabled={ratingLoading}
                  />
                  {/* Mapping updated notice */}
                  {mappingUpdated && (
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "11px",
                        color: "#14b8a6",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <span>✓</span>
                      Surrogate user updated based on your rating history
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "#475569", fontSize: "12px" }}>
                  Sign in to rate this movie
                </div>
              )}
            </div>

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
