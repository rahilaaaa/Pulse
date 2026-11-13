
import api from "./axios";
import type {
  CompanyMembership,
  CompanySelectionResponse,
} from "../types/auth";

export const getMyCompanies = async () => {
  const response = await api.get<CompanyMembership[]>(
    "/memberships/my-companies/",
  );

  return response.data;
};

export const selectCompany = async (companyId: number) => {
  const response = await api.post<CompanySelectionResponse>(
    "/memberships/select-company/",
    { company_id: companyId },
  );

  return response.data;
};

export const getCompanyContext = async () => {
  const response = await api.get("/memberships/company-context/");
  return response.data;
};