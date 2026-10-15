"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { Link } from "@/i18n/navigation";
import { Chip } from "@/components/ui/Chip";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ScrollRow } from "@/components/ui/ScrollRow";
import { SearchIcon, FilterIcon } from "@/components/layout/TabIcons";
import { ProductCard } from "@/components/product/ProductCard";
import { CatalogCard } from "@/components/product/CatalogCard";
import { getJSON, patchJSON, ApiError } from "@/lib/api-client";
import { useSavedStore } from "@/lib/store/saved-store";
import { useRoutineStore } from "@/lib/store/routine-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import { titleCaseFromSlug } from "@/lib/text";
import { BudgetSlider } from "@/components/quiz/BudgetSlider";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Product } from "@/types/product";
import type { CategoryCount } from "@/app/api/categories/route";
import type { MatchedRoutine } from "@/types/routine";
import type { UserProfile } from "@/types/user";
import type { EthicalPreferences } from "@/types/quiz";

const NO_PREFERENCES: EthicalPreferences = { vegan: false, crueltyFree: false, fragranceFree: false };

const PAGE_SIZE = 6;
const MATCHED_PREVIEW_CAP = 5;

export default function ShopPage() {
  const t = useTranslations("shop");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const savedOnly = searchParams.get("filter") === "saved";
  const savedProductIds = useSavedStore((s) => s.productIds);
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const routine = useRoutineStore((s) => s.routine);
  const setRoutine = useRoutineStore((s) => s.setRoutine);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [preferences, setPreferences] = useState<EthicalPreferences>(NO_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [budget, setBudget] = useState(1000000);
  const [tempBudget, setTempBudget] = useState(budget);
  const [tempEthics, setTempEthics] = useState<EthicalPreferences>(NO_PREFERENCES);

  // Reset pagination whenever the underlying list changes (filter/tab
  // switch) — adjusted during render per React's "you might not need an
  // effect" guidance, rather than in a useEffect.
  const listKey = `${savedOnly}:${activeFilter}:${searchQuery}:${preferences.vegan}:${preferences.crueltyFree}:${preferences.fragranceFree}:${budget}`;
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (listKey !== prevListKey) {
    setPrevListKey(listKey);
    setVisibleCount(PAGE_SIZE);
  }

  // Real products matched during the quiz → analyzing flow (with real
  // matchPercent scores), not a static "matched" flag.
  const matched = useMemo(
    () => (routine ? [...routine.am, ...routine.pm].map((s) => s.product) : []),
    [routine]
  );

  const savedEmpty = savedOnly && savedProductIds.length === 0;

  useEffect(() => {
    getJSON<CategoryCount[]>("/api/categories").then(setCategories);
  }, []);

  useEffect(() => {
    // Account-level ethical preferences from the Profile screen — read
    // fresh on every visit to Shop so a toggle there is reflected here.
    // A guest (401) just sees the unfiltered catalog. The catalog fetch
    // below waits for this to settle so the list doesn't flash once with
    // placeholder (unfiltered) results and again once real preferences
    // arrive a moment later.
    getJSON<UserProfile>("/api/profile")
      .then((p) => setPreferences(p.preferences))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
      })
      .finally(() => setPreferencesLoaded(true));
  }, []);

  useEffect(() => {
    if (filterOpen) {
      const id = setTimeout(() => {
        setTempEthics(preferences);
        setTempBudget(budget);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [filterOpen, preferences, budget]);

  async function applyFilters() {
    setFilterOpen(false);
    await patchJSON("/api/profile", { preferences: tempEthics });
    setPreferences(tempEthics);
    setBudget(tempBudget);
  }

  useEffect(() => {
    // Falls back to the server's cached last-computed routine (backed by
    // the real products table) if the client store is empty — e.g. a
    // fresh tab/session whose sessionStorage never saw the quiz result.
    if (!routine) {
      getJSON<MatchedRoutine | null>("/api/routine").then((r) => {
        if (r) setRoutine(r);
      });
    }
  }, [routine, setRoutine]);

  useEffect(() => {
    if (savedEmpty || !preferencesLoaded) return;
    let url: string;
    if (savedOnly) {
      url = `/api/products?ids=${savedProductIds.join(",")}`;
    } else {
      const params = new URLSearchParams({ category: activeFilter, limit: "60" });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (preferences.vegan) params.set("vegan", "true");
      if (preferences.crueltyFree) params.set("crueltyFree", "true");
      if (preferences.fragranceFree) params.set("fragranceFree", "true");
      if (budget < 1000000) params.set("maxPrice", String(budget));
      url = `/api/products?${params.toString()}`;
    }
    getJSON<Product[]>(url).then(setCatalog);
  }, [savedOnly, savedEmpty, savedProductIds, activeFilter, searchQuery, preferences, budget, preferencesLoaded]);

  // The catalog listing endpoint doesn't compute match scores — carry over
  // the real matchPercent for any product that's also in "Matched to Your
  // Scan" so the same badge shows in both places.
  const matchPercentById = useMemo(
    () => new Map(matched.map((p) => [p.id, p.matchPercent])),
    [matched]
  );
  const fullCatalog = savedEmpty ? [] : catalog;
  const displayedCatalog = fullCatalog
    .slice(0, visibleCount)
    .map((p) => (matchPercentById.has(p.id) ? { ...p, matchPercent: matchPercentById.get(p.id) } : p));
  const hasMore = visibleCount < fullCatalog.length;

  if (authLoaded && !user) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        subtitle="Your profile, saved products, and cart are tied to your account."
        onSignedIn={fetchUser}
      />
    );
  }

  return (
    <ScreenContainer>
      {!savedOnly && (
        <div className="sticky top-0 z-20 -mx-[18px] -mt-5 bg-app-bg px-[18px] pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
              <Chip active={activeFilter === "all"} onClick={() => setActiveFilter("all")}>
                {t("filters.all")}
              </Chip>
              {categories.map((c) => (
                <Chip
                  key={c.category}
                  active={activeFilter === c.category}
                  onClick={() => setActiveFilter(c.category)}
                >
                  {titleCaseFromSlug(c.category)}
                </Chip>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              aria-label="Filter products"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text"
            >
              <FilterIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen((o) => !o)}
              aria-label="Search products"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
          </div>
          {searchOpen && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products…"
              autoFocus
              className="mt-2 w-full rounded-full border border-border bg-surface px-[14px] py-2 text-[12.5px] text-text outline-none placeholder:text-text-faint"
            />
          )}
        </div>
      )}

      {!savedOnly && matched.length > 0 && (
        <>
          <SectionTitle
            action={<Link href="/shop/matched">{matched.length} items</Link>}
          >
            {t("matchedToScan")}
          </SectionTitle>
          <ScrollRow>
            {matched.slice(0, MATCHED_PREVIEW_CAP).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ScrollRow>
        </>
      )}

      <SectionTitle>{savedOnly ? "Saved Products" : t("browseCatalog")}</SectionTitle>
      <div className="grid grid-cols-2 gap-[10px]">
        {displayedCatalog.map((p) => (
          <CatalogCard key={p.id} product={p} />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-4 w-full rounded-full border border-border bg-surface py-3 text-[12.5px] font-bold text-canvas-ink"
        >
          Load More
        </button>
      )}
      {savedOnly && displayedCatalog.length === 0 && (
        <p className="text-[12.5px] text-text-muted">No saved products yet.</p>
      )}
      {filterOpen && (
        <ConfirmDialog
          title="Filter Products"
          message="Adjust budget and preferences"
          confirmLabel={tc("apply")}
          cancelLabel={tc("cancel")}
          onCancel={() => setFilterOpen(false)}
          onConfirm={applyFilters}
        >
          <div className="space-y-4">
            <BudgetSlider value={tempBudget} onChange={setTempBudget} min={0} max={1000000} />
            <ToggleRow label="Vegan formulas only" checked={tempEthics.vegan} onChange={() => setTempEthics({ ...tempEthics, vegan: !tempEthics.vegan })} />
            <ToggleRow label="Cruelty-free only" checked={tempEthics.crueltyFree} onChange={() => setTempEthics({ ...tempEthics, crueltyFree: !tempEthics.crueltyFree })} />
            <ToggleRow label="Fragrance-free only" checked={tempEthics.fragranceFree} onChange={() => setTempEthics({ ...tempEthics, fragranceFree: !tempEthics.fragranceFree })} />
          </div>
        </ConfirmDialog>
      )}
    </ScreenContainer>
  );
}
