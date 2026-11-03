import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../../shared/ui/States";
import type { CategoryItem, ProductItem, VendorItem } from "../types";

interface ProductsViewProps {
  companyId: string;
  currencySymbol: string;
  permissions: string[];
  initialCreateOpen?: boolean;
}

export function ProductsView({
  companyId,
  currencySymbol,
  permissions,
  initialCreateOpen = false,
}: ProductsViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code) || permissions.includes("commerce.manage");

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("active");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Queries
  const productsQuery = useQuery({
    queryKey: ["commerce-products", companyId, search, selectedCategory, selectedStatus, onlyLowStock],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedCategory) params.set("category_id", selectedCategory);
      if (selectedStatus) params.set("status", selectedStatus);
      if (onlyLowStock) params.set("low_stock", "true");
      return api<{ results: ProductItem[] }>(`/api/v1/companies/${companyId}/commerce/products/?${params.toString()}`);
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["commerce-categories", companyId],
    queryFn: () => api<{ results: CategoryItem[] }>(`/api/v1/companies/${companyId}/commerce/categories/`),
  });

  const vendorsQuery = useQuery({
    queryKey: ["commerce-vendors", companyId],
    queryFn: () => api<{ results: VendorItem[] }>(`/api/v1/companies/${companyId}/commerce/vendors/`),
  });

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api(`/api/v1/companies/${companyId}/commerce/products/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-products", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-overview", companyId] });
      setCreateOpen(false);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      api(`/api/v1/companies/${companyId}/commerce/products/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-products", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-overview", companyId] });
      setEditModalOpen(false);
      setSelectedProduct(null);
    },
  });

  const archiveProductMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/companies/${companyId}/commerce/products/${id}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-products", companyId] });
      queryClient.invalidateQueries({ queryKey: ["commerce-overview", companyId] });
      setSelectedProduct(null);
    },
  });

  const createVariantMutation = useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: Record<string, any> }) =>
      api(`/api/v1/companies/${companyId}/commerce/products/${productId}/variants/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-products", companyId] });
      setVariantModalOpen(false);
    },
  });

  const formatMoney = (minor: number) => {
    return `${currencySymbol}${(minor / 100).toFixed(2)}`;
  };

  const products = productsQuery.data?.results ?? [];
  const categories = categoriesQuery.data?.results ?? [];
  const vendors = vendorsQuery.data?.results ?? [];

  return (
    <div className="space-y-4">
      {/* Action and Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-pulse-ink">Product Catalog</h2>
          <p className="text-xs text-pulse-muted">
            Manage merchandise items, SKUs, barcode tracking, cost/selling prices, and variant options.
          </p>
        </div>

        {can("commerce.create.products") && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-pulse-border bg-pulse-surface p-3 shadow-xs">
        <div className="flex-1 min-w-[200px]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, or barcode..."
            className="w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink placeholder-pulse-muted focus:border-pulse-accent focus:outline-hidden"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs font-medium text-pulse-muted cursor-pointer px-2">
          <input
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="rounded border-pulse-border text-pulse-accent"
          />
          <span>Low Stock Only</span>
        </label>
      </div>

      {/* Products Table */}
      {productsQuery.isLoading ? (
        <LoadingState label="Loading product catalog..." />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          body={search ? "Try adjusting your search criteria." : "Create your first merchandise item to begin selling."}
          action={
            can("commerce.create.products") ? (
              <Button onClick={() => setCreateOpen(true)}>Add Product</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pulse-border bg-pulse-surface shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-pulse-border bg-pulse-canvas/50 text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU & Barcode</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Selling Price</th>
                <th className="px-4 py-3 text-right">Cost Price</th>
                <th className="px-4 py-3 text-center">Available Stock</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pulse-border">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3">
                    <div className="font-bold text-pulse-ink">{p.name}</div>
                    <div className="text-[11px] text-pulse-muted capitalize">
                      {p.product_type} product {p.variants_count > 0 && `· ${p.variants_count} variants`}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    <span className="font-semibold text-pulse-ink">{p.sku}</span>
                    {p.barcode && <span className="block text-pulse-muted">{p.barcode}</span>}
                  </td>
                  <td className="px-4 py-3 text-pulse-muted">
                    {p.category_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-pulse-ink">
                    {formatMoney(p.price_minor)}
                  </td>
                  <td className="px-4 py-3 text-right text-pulse-muted">
                    {formatMoney(p.cost_price_minor)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        p.is_low_stock
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {p.available_stock} {p.uom}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        p.status === "active"
                          ? "bg-teal-50 text-teal-700 border border-teal-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(p)}
                      className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                    >
                      Details
                    </button>
                    {can("commerce.update.products") && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProduct(p);
                          setEditModalOpen(true);
                        }}
                        className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Product Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Product">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            createProductMutation.mutate({
              name: String(form.get("name") || ""),
              sku: String(form.get("sku") || ""),
              barcode: String(form.get("barcode") || ""),
              category_id: form.get("category_id") ? String(form.get("category_id")) : null,
              vendor_id: form.get("vendor_id") ? String(form.get("vendor_id")) : null,
              price_minor: Math.round(Number(form.get("selling_price") || 0) * 100),
              cost_price_minor: Math.round(Number(form.get("cost_price") || 0) * 100),
              tax_rate: Number(form.get("tax_rate") || 18),
              uom: String(form.get("uom") || "pcs"),
              stock_quantity: Number(form.get("initial_stock") || 0),
              low_stock_threshold: Number(form.get("low_stock_threshold") || 5),
              product_type: String(form.get("product_type") || "simple"),
              description: String(form.get("description") || ""),
              track_inventory: form.get("track_inventory") === "on",
            });
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Product Name *</label>
              <input
                name="name"
                required
                placeholder="e.g. Handmade Ceramic Vase"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">SKU Code *</label>
              <input
                name="sku"
                required
                placeholder="e.g. VASE-CER-001"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Category</label>
              <select
                name="category_id"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="">No Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Supplier / Vendor</label>
              <select
                name="vendor_id"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="">Select Vendor (Optional)</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Product Type</label>
              <select
                name="product_type"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="simple">Simple Product</option>
                <option value="variant">Product with Variants</option>
                <option value="service">Service</option>
                <option value="digital">Digital Product</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Selling Price (₹) *</label>
              <input
                name="selling_price"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue="0.00"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Cost Price (₹)</label>
              <input
                name="cost_price"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0.00"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Tax Rate (%)</label>
              <input
                name="tax_rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue="18.0"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Unit (UOM)</label>
              <input
                name="uom"
                defaultValue="pcs"
                placeholder="pcs, box, kg..."
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Initial Stock On Hand</label>
              <input
                name="initial_stock"
                type="number"
                min="0"
                defaultValue="0"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Low Stock Alert Level</label>
              <input
                name="low_stock_threshold"
                type="number"
                min="0"
                defaultValue="5"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Barcode / EAN</label>
              <input
                name="barcode"
                placeholder="e.g. 8901234567890"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Description</label>
            <textarea
              name="description"
              rows={2}
              placeholder="Commercial specifications, dimensions, materials..."
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="track_inventory"
              name="track_inventory"
              defaultChecked
              className="rounded border-pulse-border text-pulse-accent"
            />
            <label htmlFor="track_inventory" className="text-xs font-medium text-pulse-ink cursor-pointer">
              Track real-time stock & inventory levels for this item
            </label>
          </div>

          {createProductMutation.isError && (
            <p className="text-xs text-rose-600">Failed to create product. Check SKU uniqueness.</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProductMutation.isPending}>
              {createProductMutation.isPending ? "Creating..." : "Save Product"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Product Detail Modal */}
      {selectedProduct && !editModalOpen && (
        <Modal
          open={Boolean(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          title={`Product: ${selectedProduct.name}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-2.5">
                <span className="text-[10px] uppercase font-bold text-pulse-muted">SKU</span>
                <p className="font-mono font-bold text-pulse-ink">{selectedProduct.sku}</p>
              </div>
              <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-2.5">
                <span className="text-[10px] uppercase font-bold text-pulse-muted">Selling Price</span>
                <p className="font-bold text-pulse-ink">{formatMoney(selectedProduct.price_minor)}</p>
              </div>
              <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-2.5">
                <span className="text-[10px] uppercase font-bold text-pulse-muted">Stock On Hand</span>
                <p className={`font-bold ${selectedProduct.is_low_stock ? "text-rose-600" : "text-emerald-600"}`}>
                  {selectedProduct.stock_quantity} {selectedProduct.uom}
                </p>
              </div>
              <div className="rounded-lg border border-pulse-border bg-pulse-canvas p-2.5">
                <span className="text-[10px] uppercase font-bold text-pulse-muted">Category</span>
                <p className="font-bold text-pulse-ink">{selectedProduct.category_name || "Uncategorized"}</p>
              </div>
            </div>

            {selectedProduct.description && (
              <div className="rounded-lg border border-pulse-border p-3 text-xs text-pulse-muted">
                {selectedProduct.description}
              </div>
            )}

            {/* Variants Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-pulse-ink">Variants & Options</h4>
                {can("commerce.create.products") && (
                  <Button size="sm" variant="ghost" onClick={() => setVariantModalOpen(true)}>
                    + Add Variant
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-pulse-muted">
                Variant SKUs, attribute dimensions, and specific stock overrides.
              </p>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-pulse-border">
              {can("commerce.archive.products") && (
                <button
                  type="button"
                  onClick={() => archiveProductMutation.mutate(selectedProduct.id)}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Archive Product
                </button>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSelectedProduct(null)}>
                  Close
                </Button>
                {can("commerce.update.products") && (
                  <Button onClick={() => setEditModalOpen(true)}>Edit Details</Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Variant Modal */}
      {selectedProduct && (
        <Modal open={variantModalOpen} onClose={() => setVariantModalOpen(false)} title={`Add Variant: ${selectedProduct.name}`}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              createVariantMutation.mutate({
                productId: selectedProduct.id,
                data: {
                  name: String(form.get("variant_name") || ""),
                  sku: String(form.get("variant_sku") || ""),
                  barcode: String(form.get("variant_barcode") || ""),
                  price_minor: Math.round(Number(form.get("variant_price") || selectedProduct.price_minor / 100) * 100),
                  stock_quantity: Number(form.get("variant_stock") || 0),
                },
              });
            }}
          >
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Variant Name (e.g. Size L, Indigo Blue) *</label>
              <input
                name="variant_name"
                required
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Variant SKU *</label>
              <input
                name="variant_sku"
                required
                placeholder={`${selectedProduct.sku}-VAR`}
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Price (₹)</label>
                <input
                  name="variant_price"
                  type="number"
                  step="0.01"
                  defaultValue={(selectedProduct.price_minor / 100).toFixed(2)}
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Stock Quantity</label>
                <input
                  name="variant_stock"
                  type="number"
                  min="0"
                  defaultValue="0"
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
              <Button variant="ghost" onClick={() => setVariantModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createVariantMutation.isPending}>
                Save Variant
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Product Modal */}
      {selectedProduct && editModalOpen && (
        <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title={`Edit: ${selectedProduct.name}`}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              updateProductMutation.mutate({
                id: selectedProduct.id,
                data: {
                  name: String(form.get("name")),
                  price_minor: Math.round(Number(form.get("price") || 0) * 100),
                  cost_price_minor: Math.round(Number(form.get("cost_price") || 0) * 100),
                  low_stock_threshold: Number(form.get("low_stock_threshold") || 5),
                  category_id: form.get("category_id") ? String(form.get("category_id")) : null,
                  status: String(form.get("status")),
                },
              });
            }}
          >
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Product Name</label>
              <input
                name="name"
                defaultValue={selectedProduct.name}
                required
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Selling Price (₹)</label>
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  defaultValue={(selectedProduct.price_minor / 100).toFixed(2)}
                  required
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Cost Price (₹)</label>
                <input
                  name="cost_price"
                  type="number"
                  step="0.01"
                  defaultValue={(selectedProduct.cost_price_minor / 100).toFixed(2)}
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Category</label>
                <select
                  name="category_id"
                  defaultValue={selectedProduct.category_id || ""}
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                >
                  <option value="">No Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Status</label>
                <select
                  name="status"
                  defaultValue={selectedProduct.status}
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
              <Button variant="ghost" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateProductMutation.isPending}>
                Update Product
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

