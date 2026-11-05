export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-[0.2em] ${className}`}>
      <span
        aria-hidden
        className="h-3 w-3 rotate-45 rounded-[3px] bg-accent shadow-[0_0_16px_var(--accent)]"
      />
      ONYX
    </span>
  );
}
