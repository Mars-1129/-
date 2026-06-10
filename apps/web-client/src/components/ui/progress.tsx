export function Progress({ value, className }: { value: number; className?: string }): JSX.Element {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-800 ${className ?? ''}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
