export function Toast({ message }: { message: string }) {
  return (
    <div className="pointer-events-auto rounded-full border border-border bg-surface px-4 py-[10px] text-[12.5px] font-semibold text-text shadow-[0_10px_30px_-10px_rgba(0,0,0,0.25)] animate-[toast-in_0.15s_ease-out]">
      {message}
    </div>
  );
}
