export function ChatSuggestRow({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="no-scrollbar my-2 flex gap-2 overflow-x-auto">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="shrink-0 whitespace-nowrap rounded-2xl border border-border bg-surface px-[13px] py-2 text-[11.5px] font-semibold text-text-muted"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
