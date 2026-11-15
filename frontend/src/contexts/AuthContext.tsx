
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

import { getOnboardingStatus } from "../api/companies";
import { setAccessToken } from "../api/axios";

import {
  getStoredCompanyId,
  setStoredCompanyId,
} from "../utils/companySession";

import type {
  ActiveCompany,
  CompanyMembership,
  LoginRequest,
  User,
} from "../types/auth";

import type { OnboardingStatusResponse } from "../types/onboarding";

interface AuthContextType {
  user: User | null;
  activeCompany: ActiveCompany | null;
  companies: CompanyMembership[];
  onboardingStatus: OnboardingStatusResponse | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  loadCompanies: () => Promise<CompanyMembership[]>;
  chooseCompany: (companyId: number) => Promise<void>;
  refreshOnboardingStatus: () => Promise<OnboardingStatusResponse>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const [activeCompany, setActiveCompany] =
    useState<ActiveCompany | null>(null);

  const [companies, setCompanies] = useState<CompanyMembership[]>([]);

  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatusResponse | null>(null);

  const [loading, setLoading] = useState(true);

  // Load company memberships.
  const loadCompanies = useCallback(async () => {
    const data = await getMyCompanies();
    setCompanies(data);
    return data;
  }, []);

  // Refresh onboarding status.
  const refreshOnboardingStatus = useCallback(async () => {
    const data = await getOnboardingStatus();
    setOnboardingStatus(data);
    return data;
  }, []);

  // Select active company.
  const chooseCompany = useCallback(async (companyId: number) => {
    const response = await selectCompanyApi(companyId);

    setAccessToken(response.access);
    setActiveCompany(response.active_company);
    setStoredCompanyId(companyId);
    setOnboardingStatus(null);
  }, []);

  // Login.
  const login = async (data: LoginRequest) => {
    const response = await loginUser(data);

    // Set access token before authenticated API requests.
    setAccessToken(response.access);

    try {
      const memberships = await getMyCompanies();

      setUser(response.user);
      setActiveCompany(null);
      setCompanies(memberships);
      setStoredCompanyId(null);
      setOnboardingStatus(null);
    } catch (error) {
      // Attempt to invalidate the server-side session.
      try {
        await logoutUser();
      } catch {
        // Continue with local cleanup.
      }

      setAccessToken(null);
      setUser(null);
      setActiveCompany(null);
      setCompanies([]);
      setStoredCompanyId(null);
      setOnboardingStatus(null);

      throw error;
    }
  };

  // Logout.
  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      setAccessToken(null);
      setUser(null);
      setActiveCompany(null);
      setCompanies([]);
      setOnboardingStatus(null);
      setStoredCompanyId(null);
    }
  };

  // Handle authentication expiration from Axios.
  useEffect(() => {
    const handleAuthExpired = () => {
      setAccessToken(null);
      setUser(null);
      setActiveCompany(null);
      setCompanies([]);
      setOnboardingStatus(null);
      setStoredCompanyId(null);
    };

    window.addEventListener(
      "pulse:auth-expired",
      handleAuthExpired
    );

    return () => {
      window.removeEventListener(
        "pulse:auth-expired",
        handleAuthExpired
      );
    };
  }, []);

  // Restore session when application starts.
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

        const memberships = await loadCompanies();

        if (!mounted) return;

        const storedCompanyId = getStoredCompanyId();

        if (
          storedCompanyId !== null &&
          memberships.some(
            (membership) =>
              membership.company === storedCompanyId
          )
        ) {
          const selection = await selectCompanyApi(storedCompanyId);

          if (!mounted) return;

          setAccessToken(selection.access);
          setActiveCompany(selection.active_company);
        } else {
          setStoredCompanyId(null);
          setActiveCompany(null);
        }
      } catch {
        if (mounted) {
          setAccessToken(null);
          setUser(null);
          setActiveCompany(null);
          setCompanies([]);
          setOnboardingStatus(null);
          setStoredCompanyId(null);
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
        onboardingStatus,
        loading,
        isAuthenticated: Boolean(user),
        login,
        logout,
        loadCompanies,
        chooseCompany,
        refreshOnboardingStatus,
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
