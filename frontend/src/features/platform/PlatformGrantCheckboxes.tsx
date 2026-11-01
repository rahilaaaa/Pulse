import type { PlatformPermission } from "../../shared/api/types";

function groupLabel(code: string): string {
  const parts = code.split(".");
  if (parts.length >= 2) {
    const area = parts[1];
    return area.charAt(0).toUpperCase() + area.slice(1);
  }
  return "Platform";
}

export function PlatformGrantCheckboxes({
  catalog,
  selected,
  onChange,
  disabled = false,
}: {
  catalog: PlatformPermission[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const groups = new Map<string, PlatformPermission[]>();
  for (const item of catalog) {
    const key = groupLabel(item.code);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  function toggle(code: string) {
    if (disabled) return;
    if (selected.includes(code)) {
      onChange(selected.filter((item) => item !== code));
    } else {
      onChange([...selected, code]);
    }
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([title, items]) => (
        <div key={title} className="grid gap-3 md:grid-cols-[12rem_1fr]">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {items.map((item) => (
              <label
                key={item.code}
                className="flex max-w-sm items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                title={item.description}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.includes(item.code)}
                  onChange={() => toggle(item.code)}
                  disabled={disabled}
                />
                <span>
                  <span className="font-medium">{item.code.replace(/^platform\./, "")}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{item.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-500 dark:text-slate-400">{selected.length} permissions selected</p>
    </div>
  );
}
