

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  getCurrentUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
} from "../api/auth";

import {
  getMyCompanies,
  selectCompany as selectCompanyApi,
} from "../api/memberships";

import { setAccessToken } from "../api/axios";

import type {
  ActiveCompany,
  CompanyMembership,
  LoginRequest,
  User,
} from "../types/auth";

interface AuthContextType {
  user: User | null;
  activeCompany: ActiveCompany | null;
  companies: CompanyMembership[];
  loading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  loadCompanies: () => Promise<CompanyMembership[]>;
  chooseCompany: (companyId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activeCompany, setActiveCompany] =
    useState<ActiveCompany | null>(null);
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCompanies = useCallback(async () => {
    const data = await getMyCompanies();
    setCompanies(data);
    return data;
  }, []);

  const login = async (data: LoginRequest) => {
    const response = await loginUser(data);

    setAccessToken(response.access);
    setUser(response.user);
    setActiveCompany(null);

    try {
  await loadCompanies();
} catch {
  setCompanies([]);
}
  };

  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      setAccessToken(null);
      setUser(null);
      setActiveCompany(null);
      setCompanies([]);
    }
  };

  const chooseCompany = async (companyId: number) => {
    const response = await selectCompanyApi(companyId);

    setAccessToken(response.access);
    setActiveCompany(response.active_company);
  };

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const response = await refreshAccessToken();

        if (!mounted) return;

        setAccessToken(response.access);

        const currentUser = await getCurrentUser();

        if (!mounted) return;

        setUser(currentUser);

        try {
          await loadCompanies();
        } catch {
          // User remains authenticated even if company loading fails.
        }
      } catch {
        if (mounted) {
          setAccessToken(null);
          setUser(null);
          setActiveCompany(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, [loadCompanies]);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeCompany,
        companies,
        loading,
        isAuthenticated: Boolean(user),
        login,
        logout,
        loadCompanies,
        chooseCompany,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}