import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { EmptyState, LoadingState } from "../../../shared/ui/States";
import type { CategoryItem } from "../types";

interface CategoriesViewProps {
  companyId: string;
  permissions: string[];
}

export function CategoriesView({ companyId, permissions }: CategoriesViewProps) {
  const queryClient = useQueryClient();
  const canManage = permissions.includes("commerce.manage.categories") || permissions.includes("commerce.manage");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["commerce-categories", companyId],
    queryFn: () => api<{ results: CategoryItem[] }>(`/api/v1/companies/${companyId}/commerce/categories/`),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      api(`/api/v1/companies/${companyId}/commerce/categories/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-categories", companyId] });
      setCreateOpen(false);
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      api(`/api/v1/companies/${companyId}/commerce/categories/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-categories", companyId] });
      setEditingCategory(null);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/companies/${companyId}/commerce/categories/${id}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce-categories", companyId] });
    },
  });

  const categories = categoriesQuery.data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-pulse-ink">Product Categories & Taxonomy</h2>
          <p className="text-xs text-pulse-muted">
            Organize catalog items into hierarchical merchandising groups and departments.
          </p>
        </div>

        {canManage && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Category
          </Button>
        )}
      </div>

      {categoriesQuery.isLoading ? (
        <LoadingState label="Loading product categories..." />
      ) : categories.length === 0 ? (
        <EmptyState
          title="No categories defined"
          body="Create product categories to structure your catalog merchandise."
          action={canManage ? <Button onClick={() => setCreateOpen(true)}>Add Category</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pulse-border bg-pulse-surface shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-pulse-border bg-pulse-canvas/50 text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Category Name</th>
                <th className="px-4 py-3">Code / Slug</th>
                <th className="px-4 py-3">Parent Category</th>
                <th className="px-4 py-3 text-center">Assigned Products</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pulse-border">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3">
                    <div className="font-bold text-pulse-ink">{c.name}</div>
                    {c.description && <div className="text-[11px] text-pulse-muted line-clamp-1">{c.description}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-pulse-muted">
                    <span className="font-semibold text-pulse-ink">{c.code || "—"}</span>
                    <span className="block text-[10px]">{c.slug}</span>
                  </td>
                  <td className="px-4 py-3 text-pulse-muted">
                    {c.parent_name ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-pulse-muted">↳</span> {c.parent_name}
                      </span>
                    ) : (
                      <span className="text-pulse-muted italic">Top-level Root</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-pulse-ink">
                    <span className="rounded-full bg-pulse-hover px-2.5 py-0.5 text-[11px]">
                      {c.product_count} products
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.status === "active"
                          ? "bg-teal-50 text-teal-700 border border-teal-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingCategory(c)}
                          className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete category '${c.name}'?`)) {
                              deleteCategoryMutation.mutate(c.id);
                            }
                          }}
                          className="rounded-md border border-pulse-border px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Category">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            createCategoryMutation.mutate({
              name: String(form.get("name")),
              code: String(form.get("code") || ""),
              slug: String(form.get("slug") || ""),
              parent_id: form.get("parent_id") ? String(form.get("parent_id")) : null,
              description: String(form.get("description") || ""),
              display_order: Number(form.get("display_order") || 0),
            });
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Category Name *</label>
            <input
              name="name"
              required
              placeholder="e.g. Home Decor & Lifestyle"
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Category Code</label>
              <input
                name="code"
                placeholder="e.g. CAT-HOME"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Parent Category</label>
              <select
                name="parent_id"
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              >
                <option value="">None (Top-Level Category)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-pulse-ink">Description</label>
            <textarea
              name="description"
              rows={2}
              placeholder="Merchandise guidelines and department notes..."
              className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCategoryMutation.isPending}>
              Save Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      {editingCategory && (
        <Modal open={Boolean(editingCategory)} onClose={() => setEditingCategory(null)} title={`Edit Category: ${editingCategory.name}`}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              updateCategoryMutation.mutate({
                id: editingCategory.id,
                data: {
                  name: String(form.get("name")),
                  code: String(form.get("code") || ""),
                  description: String(form.get("description") || ""),
                  status: String(form.get("status") || "active"),
                },
              });
            }}
          >
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Category Name</label>
              <input
                name="name"
                defaultValue={editingCategory.name}
                required
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Code</label>
                <input
                  name="code"
                  defaultValue={editingCategory.code}
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">Status</label>
                <select
                  name="status"
                  defaultValue={editingCategory.status}
                  className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pulse-ink">Description</label>
              <textarea
                name="description"
                rows={2}
                defaultValue={editingCategory.description}
                className="mt-1 block w-full rounded-lg border border-pulse-border bg-pulse-canvas px-3 py-1.5 text-xs text-pulse-ink focus:border-pulse-accent focus:outline-hidden"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
              <Button variant="ghost" onClick={() => setEditingCategory(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateCategoryMutation.isPending}>
                Update
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

