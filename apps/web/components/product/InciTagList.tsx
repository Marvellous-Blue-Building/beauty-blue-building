import type { InciIngredient } from "@/types/product";
import { cn } from "@/lib/cn";

export function InciTagList({ ingredients }: { ingredients: InciIngredient[] }) {
  return (
    <div className="my-[11px] flex flex-wrap gap-[7px]">
      {ingredients.map((ing) => (
        <span
          key={ing.name}
          className={cn(
            "rounded-[10px] border px-[9px] py-1 text-[10px]",
            ing.flagged
              ? "border-warn bg-warn-dim font-bold text-warn"
              : "border-border bg-surface text-text-muted"
          )}
        >
          {ing.name}
        </span>
      ))}
    </div>
  );
}
