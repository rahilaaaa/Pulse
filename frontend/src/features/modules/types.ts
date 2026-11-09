export interface ModuleFeature {
  title: string;
  description: string;
  icon: string;
}

export interface ModuleScreenshot {
  title: string;
  description: string;
  preview_type: string;
  badge: string;
}

export interface ModuleTutorial {
  id: string;
  title: string;
  duration: string;
  category: string;
  permissions: string[];
  summary: string;
  steps: string[];
  video_url?: string;
}

export interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  action_url: string;
  required_permission: string;
  completed: boolean;
}

export interface ModuleDependencyItem {
  slug: string;
  name: string;
  installed: boolean;
  required: boolean;
}

export interface RequirementsStatus {
  subscription_eligible: boolean;
  has_install_permission: boolean;
  dependencies_met: boolean;
  is_available: boolean;
}

export interface ModuleCardItem {
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  icon: string;
  featured: boolean;
  problem_solved: string;
  features_preview: string[];
  installation_available: boolean;
  eligible: boolean;
  status: "available" | "installing" | "installed" | "failed" | "uninstalled";
  installed: boolean;
  last_error: string;
  coming_soon: boolean;
  dependencies: string[];
}

export interface ModuleDetailData {
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  version: string;
  featured: boolean;
  problem_solved: string;
  target_users: string;
  installation_available: boolean;
  coming_soon: boolean;
  is_public: boolean;
  status: "available" | "installing" | "installed" | "failed" | "uninstalled";
  installed: boolean;
  installed_version: string | null;
  installed_at: string | null;
  last_error: string;
  config: Record<string, unknown>;
  eligible: boolean;
  features: ModuleFeature[];
  screenshots: ModuleScreenshot[];
  tutorials: ModuleTutorial[];
  config_schema: Record<string, { type: string; default: unknown; label: string }>;
  dependencies: ModuleDependencyItem[];
  onboarding_checklist: OnboardingTask[];
  requirements_status: RequirementsStatus;
}

