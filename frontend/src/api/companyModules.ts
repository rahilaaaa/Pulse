
import api from "./axios";

import type {
  AvailableModule,
  CompanyModule,
  ModuleKey,
} from "../types/companyModules";

export const getAvailableModules = async (): Promise<AvailableModule[]> => {
  const response = await api.get<AvailableModule[]>(
    "/company-modules/available/",
  );

  return response.data;
};

export const getCompanyModules = async (): Promise<CompanyModule[]> => {
  const response = await api.get<CompanyModule[]>(
    "/company-modules/",
  );

  return response.data;
};

export const installCompanyModule = async (
  moduleKey: ModuleKey,
): Promise<CompanyModule> => {
  const response = await api.post<CompanyModule>(
    "/company-modules/install/",
    { module_key: moduleKey },
  );

  return response.data;
};

export const uninstallCompanyModule = async (
  moduleKey: ModuleKey,
): Promise<CompanyModule> => {
  const response = await api.post<CompanyModule>(
    "/company-modules/uninstall/",
    { module_key: moduleKey },
  );

  return response.data;
};
