import type { ActiveCompany } from "./auth";
import type { CompanyModule, ModuleKey } from "./companyModules";

export interface CompanySetupRequest {
  name: string;
  industry: string;
  business_email: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  website?: string;
}

export interface OnboardingStatusResponse {
  step:
    | "email_verification_required"
    | "company_setup"
    | "company_selection"
    | "module_selection"
    | "company_onboarding_incomplete"
    | "access_unavailable"
    | "dashboard";
  onboarding_required: boolean;
  company?: {
    id: number;
    name: string;
  };
  membership?: {
    id: number;
    role: string;
  };
}

export interface CompleteOnboardingRequest {
  module_keys: ModuleKey[];
}

export interface CompleteOnboardingResponse {
  message: string;
  onboarding_completed: boolean;
  company: {
    id: number;
    name: string;
  };
  installed_modules: ModuleKey[];
}