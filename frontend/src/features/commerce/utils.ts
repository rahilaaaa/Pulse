export function formatMinorUnits(minor: number, currency: string = "INR"): string {
  const value = (minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (currency === "INR") {
    return `₹${value}`;
  }
  return `${currency} ${value}`;
}

export function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case "completed":
    case "delivered":
    case "paid":
    case "active":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400";
    case "approved":
    case "received":
    case "shipped":
    case "ready_for_shipment":
    case "processing":
    case "confirmed":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400";
    case "requested":
    case "draft":
    case "pending":
    case "placed":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400";
    case "rejected":
    case "cancelled":
    case "failed":
    case "archived":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
  }
}

