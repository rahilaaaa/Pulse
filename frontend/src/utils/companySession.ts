const STORAGE_KEY = "pulse_active_company_id";

export function getStoredCompanyId(): number | null {
  const value = sessionStorage.getItem(STORAGE_KEY);

  if (!value) return null;

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function setStoredCompanyId(companyId: number | null): void {
  if (companyId === null) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }

  sessionStorage.setItem(STORAGE_KEY, String(companyId));
}