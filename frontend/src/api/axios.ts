
import axios from "axios";
import type {
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// Access token stays in memory.
let accessToken: string | null = null;

// Prevent multiple simultaneous refresh requests.
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Attach access token to outgoing requests.
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Automatically refresh expired access tokens.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || "";

    const excludedEndpoints = [
      "/accounts/login/",
      "/accounts/register/",
      "/accounts/token/refresh/",
      "/accounts/csrf/",
    ];

    // Don't retry authentication endpoints or an already retried request.
    if (
      originalRequest._retry ||
      excludedEndpoints.some((endpoint) => url.includes(endpoint))
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // Share one refresh request across concurrent API failures.
      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            await api.get("/accounts/csrf/");

            const response = await api.post(
              "/accounts/token/refresh/",
              {},
            );

            const newToken = response.data.access as string;

            if (!newToken) {
              throw new Error("Refresh response did not contain an access token.");
            }

            setAccessToken(newToken);

            return newToken;
          } catch {
            setAccessToken(null);
            return null;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      const newToken = await refreshPromise;

      if (!newToken) {
        return Promise.reject(error);
      }

      // Retry the original request with the new access token.
      originalRequest.headers.Authorization = `Bearer ${newToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      setAccessToken(null);
      return Promise.reject(refreshError);
    }
  },
);

export default api;
