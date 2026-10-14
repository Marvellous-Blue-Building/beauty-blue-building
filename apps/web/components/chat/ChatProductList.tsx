import type { Product } from "@/types/product";
import { CatalogCard } from "@/components/product/CatalogCard";

/** Full-width horizontally-scrollable row of up to 6 closest-matching
 * products, shown below a bot bubble when the pipeline found what the
 * user was asking for (see lib/chat/bot-reply.ts). Reuses the real Shop
 * catalog card as-is — same Save/Add-to-cart buttons, same look — instead
 * of a bespoke chat-only component. */
export function ChatProductList({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <div className="no-scrollbar mt-[7px] flex w-full gap-[6px] overflow-x-auto">
      {products.slice(0, 6).map((product) => (
        <div key={product.id} className="w-[130px] shrink-0">
          <CatalogCard product={product} compact fromChat />
        </div>
      ))}
    </div>
  );
}
