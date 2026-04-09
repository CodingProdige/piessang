"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export function HeaderSearch({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageCameraInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [imageSearchBusy, setImageSearchBusy] = useState(false);
  const [imageSearchError, setImageSearchError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageSearchLabel, setImageSearchLabel] = useState("");
  const [imageSearchNotes, setImageSearchNotes] = useState("");
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [imageSearchAlternates, setImageSearchAlternates] = useState<string[]>([]);
  const [imageSearchResults, setImageSearchResults] = useState<
    Array<{
      id: string;
      title: string;
      href: string;
      brand: string;
      imageUrl: string;
    }>
  >([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<
    Array<{
      id: string;
      title: string;
      href: string;
      brand: string;
      imageUrl: string;
    }>
  >([]);
  const hasTypedQuery = query.trim().length >= 2;
  const searchHistoryKey = "piessang_search_history_v1";

  const pageSuggestions = useMemo(() => {
    const queryText = query.trim().toLowerCase();
    if (queryText.length < 2) return [];

    const pages = [
      { title: "All products", description: "Browse the full catalogue", href: "/products", keywords: ["products", "shop", "browse", "catalogue", "catalog"] },
      { title: "Categories", description: "Browse product categories", href: "/categories", keywords: ["categories", "category", "departments"] },
      { title: "New arrivals", description: "See what just landed on Piessang", href: "/products?newArrivals=true", keywords: ["new", "new arrivals", "latest", "fresh"] },
      { title: "Deals", description: "View products currently on sale", href: "/products?onSale=true", keywords: ["deals", "sale", "discount", "offers"] },
      { title: "My account", description: "Manage your account and preferences", href: "/account", keywords: ["account", "profile", "settings"] },
      { title: "Orders", description: "Track your orders and returns", href: "/account?section=orders", keywords: ["orders", "purchases", "returns"] },
      { title: "Support tickets", description: "Open or manage your support requests", href: "/support/tickets", keywords: ["support", "ticket", "tickets", "help"] },
      { title: "Contact us", description: "Get help from Piessang support", href: "/contact", keywords: ["contact", "support", "email", "help"] },
      { title: "Delivery", description: "Read delivery information and policies", href: "/delivery", keywords: ["delivery", "shipping", "courier"] },
      { title: "Returns", description: "Read the returns and refunds policy", href: "/returns", keywords: ["returns", "refunds", "refund"] },
      { title: "Privacy policy", description: "Read how Piessang handles your data", href: "/privacy", keywords: ["privacy", "data", "policy"] },
      { title: "Terms", description: "Read the marketplace terms and rules", href: "/terms", keywords: ["terms", "legal", "policy"] },
    ];

    return pages
      .filter((page) => {
        const haystack = [page.title, page.description, ...page.keywords].join(" ").toLowerCase();
        return haystack.includes(queryText);
      })
      .slice(0, 4);
  }, [query]);

  const filteredRecentSearches = useMemo(() => {
    const queryText = query.trim().toLowerCase();
    if (!queryText) return recentSearches.slice(0, 6);
    return recentSearches.filter((item) => item.toLowerCase().includes(queryText)).slice(0, 6);
  }, [query, recentSearches]);

  const filteredTrendingSearches = useMemo(() => {
    const queryText = query.trim().toLowerCase();
    const withoutRecent = trendingSearches.filter(
      (item) => !recentSearches.some((recent) => recent.toLowerCase() === item.toLowerCase()),
    );
    if (!queryText) return withoutRecent.slice(0, 6);
    return withoutRecent.filter((item) => item.toLowerCase().includes(queryText)).slice(0, 6);
  }, [query, recentSearches, trendingSearches]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(searchHistoryKey);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) return;
      setRecentSearches(
        parsed
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .slice(0, 6),
      );
    } catch {}
  }, []);

  useEffect(() => {
    if (!imageSearchOpen) return undefined;
    async function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(typeof reader.result === "string" ? reader.result : "");
        setImageSearchError(null);
      };
      reader.readAsDataURL(file);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [imageSearchOpen]);

  useEffect(() => {
    let cancelled = false;
    async function loadTrendingSearches() {
      try {
        const response = await fetch("/api/client/v1/search/queries", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || payload?.ok === false) return;
        const items = Array.isArray(payload?.data?.items)
          ? payload.data.items
          : Array.isArray(payload?.items)
            ? payload.items
            : [];
        if (cancelled) return;
        setTrendingSearches(
          items
            .map((item: any) => String(item?.query || "").trim())
            .filter(Boolean)
            .slice(0, 6),
        );
      } catch {}
    }

    loadTrendingSearches();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          search: trimmed,
          limit: "6",
          isActive: "true",
        });
        const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || payload?.ok === false) {
          if (!cancelled) setSuggestions([]);
          return;
        }

        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (cancelled) return;
        setSuggestions(
          items
            .map((item: any) => {
              const slug = String(
                item?.data?.product?.slug ||
                  item?.data?.product?.handle ||
                  item?.data?.docId ||
                  item?.data?.product?.unique_id ||
                  item?.id ||
                  "",
              ).trim();
              const title = String(item?.data?.product?.title || "").trim();
              if (!slug || !title) return null;
              return {
                id: String(item?.id || item?.data?.docId || slug),
                title,
                href: `/products/${encodeURIComponent(slug)}`,
                brand: String(item?.data?.brand?.title || item?.data?.grouping?.brand || "").trim(),
                imageUrl: String(item?.data?.media?.images?.[0]?.imageUrl || "").trim(),
              };
            })
            .filter(Boolean),
        );
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function persistRecentSearch(search: string) {
    const normalized = search.trim();
    if (!normalized || typeof window === "undefined") return;
    const next = [normalized, ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 6);
    setRecentSearches(next);
    try {
      window.localStorage.setItem(searchHistoryKey, JSON.stringify(next));
    } catch {}
  }

  async function trackSearch(search: string) {
    try {
      await fetch("/api/client/v1/search/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: search }),
      });
    } catch {}
  }

  function submitSearch(nextQuery?: string) {
    const search = String(nextQuery ?? query).trim();
    if (!search) return;
    persistRecentSearch(search);
    void trackSearch(search);
    setOpen(false);
    onNavigate?.();
    router.push(`/products?search=${encodeURIComponent(search)}`);
  }

  function resetImageSearchModal() {
    setImageSearchOpen(false);
    setImageSearchBusy(false);
    setImageSearchError(null);
    setImagePreview("");
    setImageSearchLabel("");
    setImageSearchNotes("");
    setImageSearchQuery("");
    setImageSearchAlternates([]);
    setImageSearchResults([]);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (imageCameraInputRef.current) imageCameraInputRef.current.value = "";
  }

  function readImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setImageSearchError("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(typeof reader.result === "string" ? reader.result : "");
      setImageSearchError(null);
      setImageSearchLabel("");
      setImageSearchNotes("");
      setImageSearchQuery("");
      setImageSearchAlternates([]);
      setImageSearchResults([]);
    };
    reader.readAsDataURL(file);
  }

  function pushImageSearchResults(nextQuery: string, nextLabel = "") {
    const params = new URLSearchParams({
      search: nextQuery,
      imageSearch: "true",
    });
    if (nextLabel) params.set("imageLabel", nextLabel);
    onNavigate?.();
    router.push(`/products?${params.toString()}`);
  }

  async function runImageSearch() {
    if (!imagePreview) {
      setImageSearchError("Add an image first.");
      return;
    }
    setImageSearchBusy(true);
    setImageSearchError(null);
    try {
      const response = await fetch("/api/client/v1/search/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: imagePreview }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to search with this image right now.");
      }
      const nextQuery = String(payload?.searchQuery || "").trim();
      const nextLabel = String(payload?.label || "").trim();
      const nextNotes = String(payload?.notes || "").trim();
      const nextAlternates = Array.isArray(payload?.alternateQueries)
        ? payload.alternateQueries.map((value: unknown) => String(value || "").trim()).filter(Boolean).slice(0, 4)
        : [];
      const nextResults = Array.isArray(payload?.items)
        ? payload.items
            .map((item: any) => {
              const slug = String(
                item?.data?.product?.slug ||
                  item?.data?.product?.handle ||
                  item?.data?.docId ||
                  item?.data?.product?.unique_id ||
                  item?.id ||
                  "",
              ).trim();
              const title = String(item?.data?.product?.title || "").trim();
              if (!slug || !title) return null;
              return {
                id: String(item?.id || item?.data?.docId || slug),
                title,
                href: `/products/${encodeURIComponent(slug)}`,
                brand: String(item?.data?.brand?.title || item?.data?.grouping?.brand || "").trim(),
                imageUrl: String(item?.data?.media?.images?.[0]?.imageUrl || "").trim(),
              };
            })
            .filter(Boolean)
            .slice(0, 8)
        : [];
      if (!nextQuery) {
        throw new Error("We could not find a useful product match from that image.");
      }
      setImageSearchLabel(nextLabel);
      setImageSearchNotes(nextNotes);
      setImageSearchQuery(nextQuery);
      setImageSearchAlternates(nextAlternates);
      setImageSearchResults(nextResults);
    } catch (cause) {
      setImageSearchError(cause instanceof Error ? cause.message : "Unable to search with this image right now.");
    } finally {
      setImageSearchBusy(false);
    }
  }

  const shouldShowDropdown =
    open &&
    (hasTypedQuery ||
      filteredRecentSearches.length > 0 ||
      filteredTrendingSearches.length > 0 ||
      loading);

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1">
      <form
        action="/products"
        className="flex min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}
      >
        <label className={`flex min-w-0 flex-1 items-center bg-white px-4 py-1.5 shadow-[0_4px_14px_rgba(20,24,27,0.08)] ${mobile ? "rounded-l-[14px]" : "rounded-l-[4px]"}`}>
          <input
            type="search"
            name="search"
            value={query}
            placeholder="Search for products, brands..."
            className="w-full bg-transparent text-[15px] text-[#4b5563] outline-none placeholder:text-[#8a94a3]"
            autoComplete="off"
            autoFocus={mobile}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setImageSearchOpen(true);
            setOpen(false);
            setImageSearchError(null);
          }}
          className="inline-flex h-[36px] w-[44px] items-center justify-center border-l border-black/8 bg-white text-[#4a4545] shadow-[0_4px_14px_rgba(20,24,27,0.08)]"
          aria-label="Search by image"
        >
          <ImageSearchIcon />
        </button>
        <button
          type="submit"
          className={`inline-flex h-[36px] w-[46px] items-center justify-center bg-[#4a4545] text-white shadow-[0_4px_14px_rgba(20,24,27,0.12)] ${mobile ? "rounded-r-[14px]" : "rounded-r-[4px]"}`}
          aria-label="Search"
        >
          <SearchIcon />
        </button>
      </form>

      {shouldShowDropdown ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[80] overflow-hidden rounded-[10px] border border-black/5 bg-white shadow-[0_18px_40px_rgba(20,24,27,0.16)]">
          {hasTypedQuery ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => submitSearch()}
              className="flex w-full items-center justify-between border-b border-black/5 px-4 py-3 text-left hover:bg-[#faf7ef]"
            >
              <span>
                <span className="block text-[13px] font-semibold text-[#202020]">Search for "{query.trim()}"</span>
                <span className="mt-0.5 block text-[12px] text-[#57636c]">View all matching products</span>
              </span>
              <span className="text-[16px] text-[#b8b8b8]">→</span>
            </button>
          ) : null}

          {filteredRecentSearches.length ? (
            <div className="border-b border-black/5">
              <div className="bg-[#fcfbf7] px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Recent searches</p>
              </div>
              <div>
                {filteredRecentSearches.map((item) => (
                  <button
                    key={`recent-${item}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitSearch(item)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#202020]">{item}</span>
                      <span className="mt-0.5 block text-[12px] text-[#57636c]">Search again</span>
                    </span>
                    <span className="text-[16px] text-[#b8b8b8]">↺</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {filteredTrendingSearches.length ? (
            <div className="border-b border-black/5">
              <div className="bg-[#fcfbf7] px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Popular searches</p>
              </div>
              <div>
                {filteredTrendingSearches.map((item) => (
                  <button
                    key={`trending-${item}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitSearch(item)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#202020]">{item}</span>
                      <span className="mt-0.5 block text-[12px] text-[#57636c]">Popular on Piessang</span>
                    </span>
                    <span className="text-[16px] text-[#b8b8b8]">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {pageSuggestions.length ? (
            <div className="border-b border-black/5">
              <div className="bg-[#fcfbf7] px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Suggested pages</p>
              </div>
              <div>
                {pageSuggestions.map((page) => (
                  <button
                    key={page.href}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.();
                      router.push(page.href);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#202020]">{page.title}</span>
                      <span className="mt-0.5 block text-[12px] text-[#57636c]">{page.description}</span>
                    </span>
                    <span className="text-[16px] text-[#b8b8b8]">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {suggestions.length ? (
            <div className="border-y border-black/5 bg-[#fcfbf7] px-4 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Matching products</p>
            </div>
          ) : null}

          {loading ? (
            <div className="px-4 py-3 text-[12px] text-[#57636c]">Searching…</div>
          ) : suggestions.length ? (
            <div className="max-h-[360px] overflow-y-auto">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                    router.push(item.href);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[#f5f5f5]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Item</span>
                    )}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[#202020]">{item.title}</span>
                    {item.brand ? (
                      <span className="mt-0.5 block truncate text-[12px] text-[#57636c]">{item.brand}</span>
                    ) : null}
                  </span>
                  <span className="text-[16px] text-[#b8b8b8]">→</span>
                </button>
              ))}
            </div>
          ) : !pageSuggestions.length && !filteredRecentSearches.length && !filteredTrendingSearches.length && hasTypedQuery ? (
            <div className="px-4 py-3 text-[12px] text-[#57636c]">No matching products found yet.</div>
          ) : null}
        </div>
      ) : null}

      {imageSearchOpen ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-[rgba(20,24,27,0.48)] px-4 py-12 sm:py-20">
          <div className="w-full max-w-[720px] rounded-[24px] border border-black/10 bg-white p-5 shadow-[0_28px_80px_rgba(20,24,27,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Image search</p>
                <h3 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">Find similar products from an image</h3>
                <p className="mt-2 text-[14px] text-[#57636c]">Upload, drag in, or paste an image to search Piessang for visually similar products.</p>
              </div>
              <button
                type="button"
                onClick={resetImageSearchModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c]"
                aria-label="Close image search"
              >
                ×
              </button>
            </div>

            <div
              className="mt-5 rounded-[20px] border border-dashed border-black/10 bg-[#fbfaf7] p-5"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) readImageFile(file);
              }}
            >
              {imagePreview ? (
                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
                  <div className="overflow-hidden rounded-[16px] border border-black/8 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Uploaded search reference" className="h-[220px] w-full object-cover" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-[15px] font-semibold text-[#202020]">Image ready</p>
                    <p className="text-[13px] leading-[1.5] text-[#57636c]">We’ll analyze the image and turn it into a product search across the Piessang catalogue.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => imageInputRef.current?.click()} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020]">
                        Replace image
                      </button>
                      <button type="button" onClick={() => imageCameraInputRef.current?.click()} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020] sm:hidden">
                        Use camera
                      </button>
                      <button type="button" onClick={() => setImagePreview("")} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020]">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#4a4545] shadow-[0_8px_24px_rgba(20,24,27,0.08)]">
                    <ImageSearchIcon className="h-7 w-7" />
                  </div>
                  <p className="mt-5 text-[16px] font-semibold text-[#202020]">Drop an image here or upload one</p>
                  <p className="mt-2 max-w-[420px] text-[13px] leading-[1.5] text-[#57636c]">You can also paste a copied image with `Cmd/Ctrl + V` while this window is open.</p>
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="mt-5 rounded-[14px] bg-[#202020] px-5 py-3 text-[14px] font-semibold text-white">
                    Upload image
                  </button>
                  <button type="button" onClick={() => imageCameraInputRef.current?.click()} className="mt-3 rounded-[14px] border border-black/10 bg-white px-5 py-3 text-[14px] font-semibold text-[#202020] sm:hidden">
                    Take photo
                  </button>
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readImageFile(file);
                }}
              />
              <input
                ref={imageCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readImageFile(file);
                }}
              />
            </div>

            {imageSearchError ? (
              <div className="mt-4 rounded-[14px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#b91c1c]">
                {imageSearchError}
              </div>
            ) : null}

            {imageSearchQuery ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[18px] border border-black/8 bg-[#fcfcfc] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Best match idea</p>
                      <p className="mt-2 text-[18px] font-semibold text-[#202020]">{imageSearchLabel || imageSearchQuery}</p>
                      <p className="mt-1 text-[13px] text-[#57636c]">Searching Piessang for: "{imageSearchQuery}"</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        resetImageSearchModal();
                        pushImageSearchResults(imageSearchQuery, imageSearchLabel);
                      }}
                      className="rounded-[12px] bg-[#202020] px-4 py-2.5 text-[13px] font-semibold text-white"
                    >
                      View all results
                    </button>
                  </div>
                  {imageSearchNotes ? <p className="mt-3 text-[13px] leading-[1.5] text-[#57636c]">{imageSearchNotes}</p> : null}
                  {imageSearchAlternates.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {imageSearchAlternates.map((alternate) => (
                        <button
                          key={alternate}
                          type="button"
                          onClick={() => {
                            setQuery(alternate);
                            setOpen(false);
                            resetImageSearchModal();
                            submitSearch(alternate);
                          }}
                          className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#202020]"
                        >
                          {alternate}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {imageSearchResults.length ? (
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[14px] font-semibold text-[#202020]">Similar products</p>
                      <p className="text-[12px] text-[#57636c]">Tap a result to open it directly.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {imageSearchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            resetImageSearchModal();
                            onNavigate?.();
                            router.push(item.href);
                          }}
                          className="flex items-center gap-3 rounded-[18px] border border-black/8 bg-white p-3 text-left shadow-[0_8px_22px_rgba(20,24,27,0.05)] transition hover:-translate-y-[1px]"
                        >
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#f5f5f5]">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Item</span>
                            )}
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold leading-[1.3] text-[#202020]">{item.title}</span>
                            {item.brand ? <span className="mt-1 block text-[12px] text-[#57636c]">{item.brand}</span> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[16px] border border-black/8 bg-[#fcfcfc] px-4 py-4 text-[13px] text-[#57636c]">
                    No close visual matches were found yet, but you can still open the full results using the search terms we detected.
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={resetImageSearchModal} className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runImageSearch()}
                disabled={imageSearchBusy || !imagePreview}
                className="rounded-[12px] bg-[#202020] px-4 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {imageSearchBusy ? "Searching image..." : "Search by image"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ImageSearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 16l4.2-4.1 2.9 2.7 2.8-2.3 1.1.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
