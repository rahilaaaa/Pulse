import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type ProductRow = { id: string; name: string; sku: string; price_minor: number };
type OrderRow = { id: string; party: string; status: string; total_minor: number; currency: string };
type PartyRow = { id: string; display_name: string };

export function CommercePage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["commerce-products", companyId],
    queryFn: () => api<{ results: ProductRow[] }>(`/api/v1/companies/${companyId}/commerce/products/`),
  });
  const orders = useQuery({
    queryKey: ["commerce-orders", companyId],
    queryFn: () => api<{ results: OrderRow[] }>(`/api/v1/companies/${companyId}/commerce/orders/`),
  });
  const parties = useQuery({
    queryKey: ["parties", companyId],
    queryFn: () => api<{ results: PartyRow[] }>(`/api/v1/companies/${companyId}/parties/`),
    enabled: workspace.permissions.includes("parties.view"),
  });
  const createProduct = useMutation({
    mutationFn: (values: { name: string; sku: string; price_minor: number }) =>
      api(`/api/v1/companies/${companyId}/commerce/products/`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["commerce-products", companyId] });
    },
  });
  const createOrder = useMutation({
    mutationFn: (values: { party_id: string; lines: { product_id: string; quantity: number }[] }) =>
      api(`/api/v1/companies/${companyId}/commerce/orders/`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["commerce-orders", companyId] });
    },
  });
  if (products.isLoading) return <LoadingState label="Loading commerce" />;
  if (products.isError) return <EmptyState title="Commerce unavailable" body="Install the Commerce module to continue." />;
  const productRows = products.data?.results ?? [];
  const orderRows = orders.data?.results ?? [];
  const partyRows = parties.data?.results ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Commerce</h1>
      {workspace.permissions.includes("commerce.manage") ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            createProduct.mutate({
              name: String(form.get("name") || ""),
              sku: String(form.get("sku") || ""),
              price_minor: Number(form.get("price_minor") || 0),
            });
            event.currentTarget.reset();
          }}
        >
          <label className="text-sm">Product<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="name" required /></label>
          <label className="text-sm">SKU<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="sku" required /></label>
          <label className="text-sm">Price (paise)<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="price_minor" type="number" min={0} defaultValue={0} /></label>
          <Button type="submit" disabled={createProduct.isPending}>Add product</Button>
        </form>
      ) : null}
      <section>
        <h2 className="text-lg font-medium">Products</h2>
        {productRows.length === 0 ? <EmptyState title="No products" body="Add a catalog item before placing orders." /> : (
          <ul className="mt-3 space-y-2 text-sm">
            {productRows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                {row.name} · {row.sku} · ₹{(row.price_minor / 100).toFixed(2)}
              </li>
            ))}
          </ul>
        )}
      </section>
      {workspace.permissions.includes("commerce.manage") && productRows.length > 0 && partyRows.length > 0 ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            createOrder.mutate({
              party_id: String(form.get("party_id") || ""),
              lines: [{ product_id: String(form.get("product_id") || ""), quantity: Number(form.get("quantity") || 1) }],
            });
          }}
        >
          <label className="text-sm">Customer
            <select className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="party_id" required>
              {partyRows.map((row) => <option key={row.id} value={row.id}>{row.display_name}</option>)}
            </select>
          </label>
          <label className="text-sm">Product
            <select className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="product_id" required>
              {productRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Qty<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="quantity" type="number" min={1} defaultValue={1} /></label>
          <Button type="submit" disabled={createOrder.isPending}>Place order</Button>
        </form>
      ) : null}
      <section>
        <h2 className="text-lg font-medium">Orders</h2>
        {orderRows.length === 0 ? <p className="mt-2 text-sm text-slate-500">Orders appear after you place one for a party.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {orderRows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                {row.party} · {row.status} · {row.currency} {(row.total_minor / 100).toFixed(2)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
