import { buildAreaPath, buildLinePath } from "@/lib/chart";

type SparklineProps = {
  values: number[];
  label: string;
  className?: string;
};

export function Sparkline({ values, label, className = "text-emerald-300" }: SparklineProps) {
  if (values.length < 2) {
    return <div className="h-5 w-full border-b border-dashed border-emerald-300/10" aria-hidden="true" />;
  }

  const line = buildLinePath(values, 120, 24, 1.5);
  const area = buildAreaPath(values, 120, 24, 1.5);

  return (
    <svg
      viewBox="0 0 120 24"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`h-5 w-full overflow-visible ${className}`}
    >
      <path d={area} fill="currentColor" opacity=".08" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
