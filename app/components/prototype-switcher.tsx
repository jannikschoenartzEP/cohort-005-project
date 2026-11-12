// PROTOTYPE — throwaway floating variant switcher. Never merge to main.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

interface Props {
  variants: { key: string; name: string }[];
  current: string;
  children?: React.ReactNode; // extra prototype controls / state readout
}

export function PrototypeSwitcher({ variants, current, children }: Props) {
  const [params, setParams] = useSearchParams();
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = variants[(idx + delta + variants.length) % variants.length];
    const p = new URLSearchParams(params);
    p.set("variant", next.key);
    setParams(p, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/15" title="Previous variant (←)">
        <ChevronLeft className="size-4" />
      </button>
      <span className="whitespace-nowrap px-1 font-medium">
        {variants[idx].key} <span className="text-white/60">({variants[idx].name})</span>
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/15" title="Next variant (→)">
        <ChevronRight className="size-4" />
      </button>
      {children && <div className="flex items-center gap-2 border-l border-white/20 pl-2">{children}</div>}
    </div>
  );
}
