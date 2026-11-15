import api from "./axios";
import type {
  CompanySetupRequest,
  OnboardingStatusResponse,
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
} from "../types/onboarding";

export const createCompany = async (data: CompanySetupRequest) => {
  const response = await api.post("/companies/onboarding/setup/", data);
  return response.data;
};

export const getOnboardingStatus = async () => {
  const response = await api.get<OnboardingStatusResponse>(
    "/companies/onboarding/status/",
  );
  return response.data;
};

export const completeOnboarding = async (
  data: CompleteOnboardingRequest,
) => {
  const response = await api.post<CompleteOnboardingResponse>(
    "/companies/onboarding/complete/",
    data,
  );

  return response.data;
};