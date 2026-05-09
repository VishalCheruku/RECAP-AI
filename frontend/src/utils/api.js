// Get API base URL from environment or default to localhost
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

/**
 * Build full API URL
 * @param {string} endpoint - API endpoint (e.g., "/upload-document")
 * @returns {string} - Full URL
 */
export function buildApiUrl(endpoint) {
  if (!endpoint.startsWith("/")) {
    endpoint = "/" + endpoint;
  }
  return `${API_BASE_URL}${endpoint}`;
}

/**
 * Make authenticated API call
 * @param {string} endpoint - API endpoint
 * @param {object} options - fetch options
 * @returns {Promise} - fetch response
 */
export async function apiCall(endpoint, options = {}) {
  const url = buildApiUrl(endpoint);
  return fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
}

export default API_BASE_URL;
