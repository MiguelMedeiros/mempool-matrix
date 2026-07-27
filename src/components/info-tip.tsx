import {
  TRANSACTION_EDUCATION,
  type TransactionEducationKey,
} from "@/lib/transaction-education";

export function InfoTip({
  field,
  label,
}: {
  field: TransactionEducationKey;
  label: string;
}) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" className="flex size-5 cursor-help items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/5 font-mono text-[9px] text-emerald-200/60 transition hover:border-emerald-300/45 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/45">
        ?
        <span className="sr-only">Explain {label}</span>
      </button>
      <span role="tooltip" className="pointer-events-none invisible fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[90] rounded-xl border border-emerald-300/20 bg-[#021009]/98 p-3 text-left font-sans text-xs normal-case leading-relaxed tracking-normal text-emerald-50/75 opacity-0 shadow-[0_16px_50px_rgba(0,0,0,.65)] backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-7 sm:w-72">
        {TRANSACTION_EDUCATION[field]}
      </span>
    </span>
  );
}

export function FieldLabel({
  children,
  field,
}: {
  children: string;
  field: TransactionEducationKey;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.13em] text-emerald-300/55">
      {children}
      <InfoTip field={field} label={children} />
    </span>
  );
}
