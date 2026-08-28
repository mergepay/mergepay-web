export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const percent = Math.min(100, Math.max(0, value));
  const tone = percent >= 100 ? "bg-flamingo" : percent >= 80 ? "bg-butter" : "bg-grape";
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-5 w-full overflow-hidden rounded-md border-2 border-ink bg-paper"><div className={`h-full ${tone} transition-[width]`} style={{ width: `${percent}%` }} /></div>;
}
