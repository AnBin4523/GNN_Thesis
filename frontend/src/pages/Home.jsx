import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import { movieAPI, recommendAPI } from "../api/index";
import { useAuth } from "../context/AuthContext";

const TMDB_IMG = "https://image.tmdb.org/t/p/w300";

function MovieCard({ movie, onClick }) {
  const [hovered, setHovered] = useState(false);
  const poster = movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null;

  return (
    <div
      onClick={() => onClick(movie.movie_id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer",
        borderRadius: "10px",
        overflow: "hidden",
        background: "#1e293b",
        border: `1px solid ${hovered ? "rgba(20,184,166,0.4)" : "rgba(30,41,59,0.8)"}`,
        transition: "all 0.2s",
        transform: hovered ? "translateY(-4px)" : "none",
      }}
    >
      {/* Poster */}
      <div
        style={{
          position: "relative",
          paddingTop: "150%",
          background: "#0f172a",
        }}
      >
        {poster ? (
          <img
            src={poster}
            alt={movie.title}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect
                x="2"
                y="3"
                width="20"
                height="18"
                rx="2"
                stroke="#334155"
                strokeWidth="1.5"
              />
              <path
                d="M8 10l3 3 5-5"
                stroke="#334155"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
        {/* Year badge */}
        {movie.year_published && (
          <div
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              background: "rgba(10,15,30,0.85)",
              border: "1px solid rgba(20,184,166,0.3)",
              borderRadius: "4px",
              padding: "2px 6px",
              color: "#14b8a6",
              fontSize: "11px",
              fontWeight: "600",
            }}
          >
            {movie.year_published}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "0.75rem" }}>
        <div
          style={{
            color: "#f1f5f9",
            fontSize: "13px",
            fontWeight: "500",
            marginBottom: "4px",
            lineHeight: "1.3",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {movie.title}
        </div>
        {movie.genres && (
          <div style={{ color: "#475569", fontSize: "11px" }}>
            {typeof movie.genres === "string"
              ? movie.genres.split(",").slice(0, 2).join(", ")
              : movie.genres.slice(0, 2).join(", ")}
          </div>
        )}
        {/* Rating */}
        {movie.avg_rating && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "6px",
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="#f59e0b"
              stroke="#f59e0b"
              strokeWidth="1.5"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span
              style={{ color: "#f59e0b", fontSize: "11px", fontWeight: "600" }}
            >
              {Number(movie.avg_rating).toFixed(1)}
            </span>
            {movie.total_ratings > 0 && (
              <span style={{ color: "#334155", fontSize: "10px" }}>
                ({movie.total_ratings})
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeGenre, setActiveGenre] = useState(null);
  const [movies, setMovies] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 20;

  // Load movies (browse or genre filter)
  const loadMovies = useCallback(async (genre, offset = 0) => {
    setLoading(true);
    try {
      const res = await movieAPI.listMovies(genre, LIMIT, offset);
      if (offset === 0) {
        setMovies(res.data);
      } else {
        setMovies((prev) => [...prev, ...res.data]);
      }
      setHasMore(res.data.length === LIMIT);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Load recommendations for current user
  const loadRecommended = useCallback(async () => {
    if (!user?.ml1m_user_id) return;
    try {
      const res = await recommendAPI.getRecommend(
        user.ml1m_user_id,
        "lightgcn",
        10,
      );
      setRecommended(res.data.items || []);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const genreParam = params.get("genre");
    const fromGenre = location.state?.fromGenre;
    const savedScroll = location.state?.scrollY;

    if (fromGenre !== undefined) {
      // Coming back from MovieDetail
      setActiveGenre(fromGenre);
      loadMovies(fromGenre, 0);
    } else if (genreParam) {
      setActiveGenre(genreParam);
      loadMovies(genreParam, 0);
    } else {
      loadMovies(null, 0);
    }

    if (savedScroll) {
      setTimeout(() => {
        window.scrollTo(0, savedScroll);
      }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRecommended();
  }, [loadRecommended]);

  // Genre filter
  const handleGenreChange = (genre) => {
    setActiveGenre(genre);
    setPage(0);
    setSearchQuery("");
    setSearchResults([]);
    loadMovies(genre, 0);
  };

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await movieAPI.searchMovies(searchQuery, 20);
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Load more
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadMovies(activeGenre, nextPage * LIMIT);
  };

  const handleMovieClick = (movieId) => {
    // Ghi genre + scroll vào entry hiện tại của Home trước khi rời đi,
    // để khi navigate(-1) từ MovieDetail quay về, location.state còn nguyên.
    navigate(location.pathname + location.search, {
      replace: true,
      state: { fromGenre: activeGenre, scrollY: window.scrollY },
    });
    navigate(`/movies/${movieId}`);
  };

  const displayMovies = searchQuery.trim() ? searchResults : movies;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <Navbar activeGenre={activeGenre} onGenreChange={handleGenreChange} />

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "1.5rem" }}>
        {/* Search bar */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ position: "relative", maxWidth: "500px" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            >
              <circle
                cx="11"
                cy="11"
                r="8"
                stroke="#475569"
                strokeWidth="1.5"
              />
              <path
                d="M21 21l-4.35-4.35"
                stroke="#475569"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(30,41,59,0.8)",
                border: "1px solid rgba(51,65,85,0.8)",
                borderRadius: "10px",
                padding: "10px 14px 10px 38px",
                color: "#f1f5f9",
                fontSize: "14px",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#14b8a6")}
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(51,65,85,0.8)")
              }
            />
          </div>
        </div>

        {/* Recommended section — only when no search/filter */}
        {!searchQuery && !activeGenre && recommended.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
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
                  background: "#14b8a6",
                  borderRadius: "2px",
                }}
              />
              <h2
                style={{
                  color: "#f1f5f9",
                  fontSize: "16px",
                  fontWeight: "600",
                  margin: 0,
                }}
              >
                Recommended for you
              </h2>
              <span
                style={{
                  background: "rgba(20,184,166,0.15)",
                  border: "1px solid rgba(20,184,166,0.3)",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  color: "#14b8a6",
                  fontSize: "11px",
                }}
              >
                LightGCN
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: "1rem",
              }}
            >
              {recommended.map((movie) => (
                <MovieCard
                  key={movie.movie_id}
                  movie={movie}
                  onClick={handleMovieClick}
                />
              ))}
            </div>
          </div>
        )}

        {/* Browse section */}
        <div>
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
                background: "#334155",
                borderRadius: "2px",
              }}
            />
            <h2
              style={{
                color: "#f1f5f9",
                fontSize: "16px",
                fontWeight: "600",
                margin: 0,
              }}
            >
              {searchQuery
                ? `Search results for "${searchQuery}"`
                : activeGenre
                  ? `${activeGenre} movies`
                  : "Browse all movies"}
            </h2>
            {displayMovies.length > 0 && (
              <span style={{ color: "#475569", fontSize: "13px" }}>
                {displayMovies.length} movies
              </span>
            )}
          </div>

          {loading && movies.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "#475569",
                padding: "3rem 0",
              }}
            >
              Loading...
            </div>
          ) : displayMovies.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "#475569",
                padding: "3rem 0",
              }}
            >
              No movies found
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: "1rem",
                }}
              >
                {displayMovies.map((movie) => (
                  <MovieCard
                    key={movie.movie_id}
                    movie={movie}
                    onClick={handleMovieClick}
                  />
                ))}
              </div>

              {/* Load more */}
              {!searchQuery && hasMore && (
                <div style={{ textAlign: "center", marginTop: "2rem" }}>
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    style={{
                      background: "rgba(20,184,166,0.1)",
                      border: "1px solid rgba(20,184,166,0.3)",
                      borderRadius: "8px",
                      padding: "10px 24px",
                      color: "#14b8a6",
                      fontSize: "13px",
                      fontWeight: "500",
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {loading ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
