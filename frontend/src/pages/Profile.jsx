import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { useAuth } from "../context/AuthContext";
import { userAPI, authAPI } from "../api/index";

const parseGenres = (genres) => {
  if (!genres) return [];
  if (Array.isArray(genres)) return genres;
  return genres.split(/[|,]/).map((g) => g.trim()).filter(Boolean);
};

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";

const ALL_GENRES = [
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

export default function Profile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [ml1mInfo, setMl1mInfo] = useState(null);
  const [ratedMovies, setRatedMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingGenres, setEditingGenres] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [savingGenres, setSavingGenres] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [currentMl1mId, setCurrentMl1mId] = useState(null);
  const [webRatings, setWebRatings] = useState([]);
  const [loadingWebRatings, setLoadingWebRatings] = useState(false);
  const remapDoneRef = useRef(false);

  const preferredGenres = user?.preferred_genres
    ? user.preferred_genres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  // Compute top genres from ML-1M user's rated movies
  const computeTopGenres = (movies) => {
    const genreCount = {};
    movies.forEach((movie) => {
      if (Array.isArray(movie.genres)) {
        movie.genres.forEach((g) => {
          genreCount[g] = (genreCount[g] || 0) + 1;
        });
      }
    });
    return Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([genre, count]) => ({ genre, count }));
  };

  const fetchMl1mData = async (ml1mId) => {
    if (!ml1mId) return;
    setLoading(true);
    try {
      const [infoRes, ratedRes] = await Promise.all([
        userAPI.getUserInfo(ml1mId),
        userAPI.getUserRated(ml1mId, 50),
      ]);
      setMl1mInfo(infoRes.data);
      setRatedMovies(ratedRes.data);
      setCurrentMl1mId(ml1mId);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.ml1m_user_id != null && user.ml1m_user_id > 0) {
      fetchMl1mData(user.ml1m_user_id);
    }
  }, [user?.ml1m_user_id]);

  // Fetch web user's own rating history
  useEffect(() => {
    if (!user?.user_id) return;
    const fetchWebRatings = async () => {
      setLoadingWebRatings(true);
      try {
        const res = await userAPI.getWebRatings(user.user_id, 100);
        const data = res.data;
        setWebRatings(data);

        // Auto-remap once if user has enough ratings (catches seeded data too)
        if (data.length >= 10 && !remapDoneRef.current) {
          remapDoneRef.current = true;
          try {
            const remapRes = await authAPI.remap(user.user_id);
            const newId = remapRes.data.ml1m_user_id;
            if (newId != null && newId !== user.ml1m_user_id) {
              updateUser({ ml1m_user_id: newId });
              await fetchMl1mData(newId);
            }
          } catch {
            // remap fails silently — ratings still shown correctly
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingWebRatings(false);
      }
    };
    fetchWebRatings();
  }, [user?.user_id]);

  const handleEditGenres = () => {
    setSelectedGenres([...preferredGenres]);
    setEditingGenres(true);
    setSaveSuccess(false);
  };

  const toggleGenre = (genre) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  };

  const handleSaveGenres = async () => {
    if (selectedGenres.length === 0) return;
    setSavingGenres(true);
    try {
      const res = await authAPI.updateGenres(user.user_id, selectedGenres);
      const newId = res.data.ml1m_user_id;
      const newGenres = res.data.preferred_genres;
      updateUser({ preferred_genres: newGenres, ml1m_user_id: newId });
      setEditingGenres(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchMl1mData(newId);
    } catch {
      // ignore
    } finally {
      setSavingGenres(false);
    }
  };

  const topGenres = computeTopGenres(ratedMovies);
  const maxCount = topGenres[0]?.count || 1;
  const preferredSet = new Set(preferredGenres);
  const ml1mGenreSet = new Set(topGenres.map((g) => g.genre));
  const overlapGenres = preferredGenres.filter((g) => ml1mGenreSet.has(g));

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
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(20,184,166,0.2)",
            borderRadius: "16px",
            padding: "2rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              flexShrink: 0,
              background: "rgba(20,184,166,0.2)",
              border: "2px solid #14b8a6",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              fontWeight: "700",
              color: "#14b8a6",
            }}
          >
            {user?.display_name?.[0]?.toUpperCase() || "U"}
          </div>

          <div style={{ flex: 1 }}>
            <h1
              style={{
                color: "#f1f5f9",
                fontSize: "22px",
                fontWeight: "700",
                margin: "0 0 0.25rem",
              }}
            >
              {user?.display_name}
            </h1>
            <p
              style={{
                color: "#475569",
                fontSize: "13px",
                margin: "0 0 0.75rem",
              }}
            >
              {user?.email || ""}
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(20,184,166,0.1)",
                border: "1px solid rgba(20,184,166,0.25)",
                borderRadius: "6px",
                padding: "4px 10px",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  stroke="#14b8a6"
                  strokeWidth="1.5"
                />
                <circle
                  cx="4"
                  cy="6"
                  r="2"
                  stroke="#14b8a6"
                  strokeWidth="1.5"
                />
                <circle
                  cx="20"
                  cy="6"
                  r="2"
                  stroke="#14b8a6"
                  strokeWidth="1.5"
                />
                <line
                  x1="12"
                  y1="9"
                  x2="4"
                  y2="6"
                  stroke="#14b8a6"
                  strokeWidth="1.5"
                />
                <line
                  x1="12"
                  y1="9"
                  x2="20"
                  y2="6"
                  stroke="#14b8a6"
                  strokeWidth="1.5"
                />
              </svg>
              <span
                style={{
                  color: "#14b8a6",
                  fontSize: "12px",
                  fontWeight: "500",
                }}
              >
                ML-1M User #{currentMl1mId || user?.ml1m_user_id}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate("/recommend")}
            style={{
              background: "#14b8a6",
              color: "#0a0f1e",
              border: "none",
              borderRadius: "8px",
              padding: "9px 16px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#0d9488")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#14b8a6")}
          >
            My Recommendations
          </button>
        </div>

        {/* 2 columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* ML-1M Profile */}
          <div
            style={{
              background: "rgba(15,23,42,0.85)",
              border: "1px solid rgba(30,41,59,0.8)",
              borderRadius: "12px",
              padding: "1.5rem",
            }}
          >
            <h2
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
                  background: "#14b8a6",
                  borderRadius: "2px",
                }}
              />
              Matched ML-1M User
            </h2>
            {loading ? (
              <div style={{ color: "#475569", fontSize: "13px" }}>
                Loading...
              </div>
            ) : ml1mInfo ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {[
                  { label: "User ID", value: `#${currentMl1mId}` },
                  { label: "Gender", value: ml1mInfo.gender },
                  { label: "Age Group", value: ml1mInfo.age },
                  { label: "Occupation", value: ml1mInfo.occupation },
                  {
                    label: "Rated",
                    value: ml1mInfo.num_rated
                      ? `${ml1mInfo.num_rated} movies`
                      : null,
                  },
                ].map(({ label, value }) =>
                  value ? (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: "#64748b", fontSize: "13px" }}>
                        {label}
                      </span>
                      <span
                        style={{
                          color: "#cbd5e1",
                          fontSize: "13px",
                          fontWeight: "500",
                        }}
                      >
                        {value}
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              <div style={{ color: "#475569", fontSize: "13px" }}>No data</div>
            )}
          </div>

          {/* Preferred Genres */}
          <div
            style={{
              background: "rgba(15,23,42,0.85)",
              border: "1px solid rgba(30,41,59,0.8)",
              borderRadius: "12px",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <h2
                style={{
                  color: "#f1f5f9",
                  fontSize: "14px",
                  fontWeight: "600",
                  margin: 0,
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
                Your Preferred Genres
              </h2>
              {!editingGenres && (
                <button
                  onClick={handleEditGenres}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(20,184,166,0.3)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    color: "#14b8a6",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(20,184,166,0.1)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  Edit
                </button>
              )}
            </div>

            {editingGenres ? (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginBottom: "1rem",
                  }}
                >
                  {ALL_GENRES.map((genre) => {
                    const active = selectedGenres.includes(genre);
                    return (
                      <button
                        key={genre}
                        onClick={() => toggleGenre(genre)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: active ? "600" : "400",
                          border: active
                            ? "1px solid #14b8a6"
                            : "1px solid rgba(51,65,85,0.8)",
                          background: active
                            ? "rgba(20,184,166,0.2)"
                            : "rgba(30,41,59,0.5)",
                          color: active ? "#14b8a6" : "#64748b",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {genre}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleSaveGenres}
                    disabled={savingGenres || selectedGenres.length === 0}
                    style={{
                      flex: 1,
                      background: "#14b8a6",
                      color: "#0a0f1e",
                      border: "none",
                      borderRadius: "6px",
                      padding: "7px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      opacity: selectedGenres.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {savingGenres ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingGenres(false)}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "1px solid rgba(51,65,85,0.8)",
                      borderRadius: "6px",
                      padding: "7px",
                      color: "#64748b",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {saveSuccess && (
                  <div
                    style={{
                      background: "rgba(20,184,166,0.1)",
                      border: "1px solid rgba(20,184,166,0.3)",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      color: "#14b8a6",
                      fontSize: "12px",
                      marginBottom: "0.75rem",
                    }}
                  >
                    ✓ Genres updated — ML-1M user remapped!
                  </div>
                )}
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
                >
                  {preferredGenres.map((g) => (
                    <span
                      key={g}
                      style={{
                        background: "rgba(20,184,166,0.1)",
                        border: "1px solid rgba(20,184,166,0.25)",
                        borderRadius: "20px",
                        padding: "4px 12px",
                        color: "#14b8a6",
                        fontSize: "12px",
                        fontWeight: "500",
                      }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Genre Similarity */}
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(30,41,59,0.8)",
            borderRadius: "12px",
            padding: "1.5rem",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <h2
              style={{
                color: "#f1f5f9",
                fontSize: "14px",
                fontWeight: "600",
                margin: "0 0 0.4rem",
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
              Genre Similarity with ML-1M User #{currentMl1mId}
            </h2>
            <p style={{ color: "#475569", fontSize: "12px", margin: 0 }}>
              Bars show how often ML-1M User #{currentMl1mId} rated movies in
              each genre. Highlighted genres match your preferences.
            </p>
          </div>

          {/* Overlap summary */}
          {overlapGenres.length > 0 && (
            <div
              style={{
                background: "rgba(20,184,166,0.08)",
                border: "1px solid rgba(20,184,166,0.2)",
                borderRadius: "8px",
                padding: "10px 14px",
                marginBottom: "1rem",
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
              <span style={{ color: "#14b8a6", fontSize: "12px" }}>
                <strong>{overlapGenres.length}</strong> matching genres:{" "}
                {overlapGenres.join(", ")}
              </span>
            </div>
          )}

          {/* Genre bars */}
          {loading ? (
            <div style={{ color: "#475569", fontSize: "13px" }}>Loading...</div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              {topGenres.map(({ genre, count }) => {
                const isMatch = preferredSet.has(genre);
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={genre}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: isMatch ? "600" : "400",
                          color: isMatch ? "#14b8a6" : "#64748b",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {isMatch && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="#14b8a6"
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {genre}
                      </span>
                      <span style={{ fontSize: "11px", color: "#334155" }}>
                        {count} movies
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "rgba(30,41,59,0.8)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "3px",
                          width: `${pct}%`,
                          background: isMatch
                            ? "linear-gradient(90deg, #14b8a6, #0d9488)"
                            : "rgba(51,65,85,0.8)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Rating History ── */}
      <div
        style={{
          maxWidth: "900px",
          margin: "1.5rem auto 0",
          padding: "0 1.5rem 2rem",
        }}
      >
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(30,41,59,0.8)",
            borderRadius: "12px",
            padding: "1.25rem",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                width: "3px",
                height: "20px",
                background: "#f59e0b",
                borderRadius: "2px",
              }}
            />
            <h2
              style={{
                color: "#f1f5f9",
                fontSize: "15px",
                fontWeight: "600",
                margin: 0,
              }}
            >
              My Ratings
            </h2>
            {webRatings.length > 0 && (
              <span style={{ color: "#475569", fontSize: "12px" }}>
                {webRatings.length} movies rated
              </span>
            )}
          </div>

          {loadingWebRatings ? (
            <div style={{ color: "#475569", fontSize: "13px" }}>Loading...</div>
          ) : webRatings.length === 0 ? (
            <div
              style={{
                color: "#334155",
                fontSize: "13px",
                textAlign: "center",
                padding: "1.5rem 0",
              }}
            >
              You haven't rated any movies yet. Rate movies on their detail
              page.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              {webRatings.map((item) => (
                <div
                  key={item.movie_id}
                  onClick={() => navigate(`/movies/${item.movie_id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(30,41,59,0.6)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {/* Poster thumbnail */}
                  <div
                    style={{
                      width: "36px",
                      height: "54px",
                      flexShrink: 0,
                      borderRadius: "4px",
                      overflow: "hidden",
                      background: "#1e293b",
                    }}
                  >
                    {item.poster_path ? (
                      <img
                        src={`${TMDB_IMG}${item.poster_path}`}
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
                          background: "#1e293b",
                        }}
                      />
                    )}
                  </div>

                  {/* Title + genres */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: "#f1f5f9",
                        fontSize: "13px",
                        fontWeight: "500",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.title}
                    </div>
                    {item.genres && (
                      <div
                        style={{
                          color: "#475569",
                          fontSize: "11px",
                          marginTop: "2px",
                        }}
                      >
                        {parseGenres(item.genres).slice(0, 2).join(", ")}
                      </div>
                    )}
                  </div>

                  {/* Star rating */}
                  <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill={star <= item.rating ? "#f59e0b" : "none"}
                        stroke={star <= item.rating ? "#f59e0b" : "#334155"}
                        strokeWidth="1.5"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
