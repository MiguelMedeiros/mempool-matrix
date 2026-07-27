"use client";

import { useRef, useState } from "react";

export function CopyValueButton({
  value,
  label = "copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetRef.current) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="min-h-9 shrink-0 rounded-full border border-emerald-300/15 bg-emerald-300/5 px-3 font-mono text-[8px] uppercase tracking-[.14em] text-emerald-100/55 transition hover:border-emerald-300/40 hover:text-emerald-50"
    >
      <span aria-live="polite">{copied ? "copied" : label}</span>
    </button>
  );
}
