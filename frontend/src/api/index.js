import axios from "axios";

const API_BASE = "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// ============================================================
// AUTH
// ============================================================
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  updateGenres: (userId, genres) =>
    api.put("/auth/update-genres", {
      user_id: userId,
      preferred_genres: genres,
    }),
  remap: (userId) => api.post("/auth/remap", { user_id: userId }),
};

// ============================================================
// RECOMMENDATIONS
// ============================================================
export const recommendAPI = {
  getRecommend: (userIdx, model = "lightgcn", k = 10) =>
    api.get(`/recommend/${userIdx}`, { params: { model, k } }),
  getCompare: (userIdx, k = 10) =>
    api.get(`/recommend/compare/${userIdx}`, { params: { k } }),
};

// ============================================================
// USERS
// ============================================================
export const userAPI = {
  getUserInfo: (ml1mUserId) => api.get(`/users/${ml1mUserId}`),
  getUserRated: (ml1mUserId, limit = 20) =>
    api.get(`/users/${ml1mUserId}/rated`, { params: { limit } }),
  getWebRatings: (userId, limit = 100) =>
    api.get(`/users/web/${userId}/ratings`, { params: { limit } }),
};

// ============================================================
// MOVIES
// ============================================================
export const movieAPI = {
  getMovie: (movieId) => api.get(`/movies/${movieId}`),
  listMovies: (genre, limit = 20, offset = 0) => {
    const params = { limit, offset };
    if (genre) params.genre = genre;
    return api.get("/movies", { params });
  },
  searchMovies: (q, limit = 20) =>
    api.get("/movies/search", { params: { q, limit } }),
};

// ============================================================
// GRAPH
// ============================================================
export const graphAPI = {
  getSubgraph: (ml1mUserId, movieLimit = 10) =>
    api.get(`/graph/user/${ml1mUserId}`, {
      params: { movie_limit: movieLimit },
    }),
  getStats: () => api.get("/graph/stats"),
};

// ============================================================
// METRICS
// ============================================================
export const metricsAPI = {
  getMetrics: () => api.get("/metrics"),
  getPatienceSensitivity: () => api.get("/metrics/patience"),
};

// ============================================================
// RATINGS
// ============================================================
export const ratingAPI = {
  getRating: (movieId, userId) =>
    api.get(`/ratings/${movieId}`, { params: { user_id: userId } }),
  rateMovie: (movieId, userId, rating) =>
    api.put(`/ratings/${movieId}`, { rating }, { params: { user_id: userId } }),
  unrateMovie: (movieId, userId) =>
    api.delete(`/ratings/${movieId}`, { params: { user_id: userId } }),
};

// ============================================================
// HEALTH
// ============================================================
export const healthAPI = {
  check: () => api.get("/health"),
};

export default api;
