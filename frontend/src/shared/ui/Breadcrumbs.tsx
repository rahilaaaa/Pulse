export function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500 dark:text-slate-400">
      <ol className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <li key={item} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            <span className={index === items.length - 1 ? "font-medium text-slate-800 dark:text-slate-200" : undefined}>{item}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
