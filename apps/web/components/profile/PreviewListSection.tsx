import { Fragment, type ReactNode } from "react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ScrollRow } from "@/components/ui/ScrollRow";
import { Link } from "@/i18n/navigation";
import { PREVIEW_CAP } from "@/lib/constants";

interface PreviewListSectionProps<T> {
  title: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
  getKey: (item: T, index: number) => string | number;
  viewAllLabel: string;
  viewAllHref: string;
}

/**
 * Caps any list at PREVIEW_CAP (5) items with a "View All" link — used for
 * both Saved Products and Your Cart on the profile screen.
 *
 * Uses a keyed Fragment (not a wrapping <div>) around each renderItem result
 * — the card component itself (e.g. a <Link> with `min-w-[132px] shrink-0`)
 * is meant to be the direct flex child of the scrolling row, same as
 * ProductCard/CatalogCard elsewhere in the app. An extra unstyled wrapper
 * div breaks that sizing contract and squashes/misrenders the cards.
 */
export function PreviewListSection<T>({
  title,
  items,
  renderItem,
  getKey,
  viewAllLabel,
  viewAllHref,
}: PreviewListSectionProps<T>) {
  const preview = items.slice(0, PREVIEW_CAP);

  return (
    <>
      <SectionTitle
        action={
          items.length > 0 ? (
            <Link href={viewAllHref}>{viewAllLabel}</Link>
          ) : undefined
        }
      >
        {title}
      </SectionTitle>
      {preview.length > 0 ? (
        <ScrollRow>
          {preview.map((item, i) => (
            <Fragment key={getKey(item, i)}>{renderItem(item)}</Fragment>
          ))}
        </ScrollRow>
      ) : (
        <p className="mb-4 text-[12px] text-text-muted">Nothing here yet.</p>
      )}
    </>
  );
}
