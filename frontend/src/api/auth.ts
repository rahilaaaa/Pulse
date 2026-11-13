import api from "./axios";
import type {
  ApiMessageResponse,
  LoginRequest,
  LoginResponse,
  User,
} from "../types/auth";

export interface RegistrationRequest {
  company_name: string;
  industry: string;
  business_email: string;
  phone: string;
  country: string;
  website?: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

export const loginUser = async (data: LoginRequest) => {
  await api.get("/accounts/csrf/");

  const response = await api.post<LoginResponse>(
    "/accounts/login/",
    data,
  );

  return response.data;
};

export const registerCompany = async (data: RegistrationRequest) => {
  await api.get("/accounts/csrf/");

  const response = await api.post<ApiMessageResponse>(
    "/accounts/register/",
    data,
  );

  return response.data;
};

export const verifyEmail = async (token: string) => {
  const response = await api.post<ApiMessageResponse>(
    "/accounts/verify-email/",
    { token },
  );

  return response.data;
};

export const requestPasswordReset = async (email: string) => {
  const response = await api.post<ApiMessageResponse>(
    "/accounts/password/forgot/",
    { email },
  );

  return response.data;
};

export const confirmPasswordReset = async (
  token: string,
  newPassword: string,
) => {
  const response = await api.post<ApiMessageResponse>(
    "/accounts/password/reset/",
    {
      token,
      new_password: newPassword,
    },
  );

  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get<User>("/accounts/me/");
  return response.data;
};

export const logoutUser = async () => {
  await api.post<ApiMessageResponse>("/accounts/logout/");
};

export const refreshAccessToken = async () => {
  await api.get("/accounts/csrf/");

  const response = await api.post<{ access: string }>(
    "/accounts/token/refresh/",
    {},
  );

  return response.data;
};