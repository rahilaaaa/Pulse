
export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  user: User;
  access: string;
}

export interface CompanyMembership {
  id: number;
  company: number;
  company_name: string;
  company_industry: string;
  role: "owner" | "admin" | "member";
  status: "pending" | "active" | "suspended" | "removed";
  joined_at: string | null;
}

export interface ActiveCompany {
  id: number;
  name: string;
  role: "owner" | "admin" | "member";
}

export interface CompanySelectionResponse {
  message: string;
  active_company: ActiveCompany;
  access: string;
}

export interface ApiMessageResponse {
  message: string;
}