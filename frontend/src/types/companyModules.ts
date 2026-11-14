
export type ModuleKey = "hrms" | "project_management";

export type ModuleStatus = "installed" | "uninstalled";

export interface AvailableModule {
  key: ModuleKey;
  name: string;
  version: string;
  description: string;
}

export interface CompanyModule {
  module_key: ModuleKey;
  status: ModuleStatus;
  installed_at: string;
  uninstalled_at: string | null;
}
