import { Button } from "./Button";

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
      <span>
        Page {page}
        {pageCount > 0 ? ` of ${pageCount}` : ""}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" type="button" disabled={pageCount === 0 || page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
