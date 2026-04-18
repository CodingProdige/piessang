"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PRODUCT_ENGAGEMENT_BADGE_ICON_OPTIONS, normalizeBadgeIconUrl } from "@/lib/analytics/product-engagement-badge-icons";
import { PRODUCT_ENGAGEMENT_BADGE_COLOR_OPTIONS, getBadgeColorPreset, getBadgeColorStyle, normalizeBadgeHexColor } from "@/lib/analytics/product-engagement-badge-colors";
import { clientStorage } from "@/lib/firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

function toNum(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value?: string | null) {
  const input = value == null ? "" : String(value).trim();
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SaveButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#202020] px-5 text-[13px] font-semibold text-white transition hover:bg-[#111111]"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center rounded-[12px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] transition hover:bg-[#faf8f3] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" | "blue" | "slate" }) {
  const toneClass =
    tone === "green"
      ? "border-[#cdebdc] bg-[#ecfdf5] text-[#166534]"
      : tone === "amber"
        ? "border-[#f2deb4] bg-[#fffbeb] text-[#92400e]"
        : tone === "blue"
          ? "border-[#cfe0ff] bg-[#eff6ff] text-[#1d4ed8]"
          : "border-black/10 bg-[#f6f7f8] text-[#57636c]";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${toneClass}`}>
      {label}
    </span>
  );
}

function ToggleRow({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[16px] border border-black/8 bg-[#faf8f3] p-4">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span>
        <span className="block text-[14px] font-semibold text-[#202020]">{label}</span>
        <span className="mt-1 block text-[13px] leading-[1.55] text-[#6a7684]">{description}</span>
      </span>
    </label>
  );
}

function FieldInput({
  label,
  value,
  min,
  max,
  step,
  disabled,
  helper,
  onChange,
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  helper?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7a8594]">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] font-medium text-[#202020] outline-none focus:border-[#c9a44b]"
      />
      {helper ? <span className="mt-1.5 block text-[12px] leading-[1.5] text-[#7a8594]">{helper}</span> : null}
    </label>
  );
}

function TextInput({
  label,
  value,
  disabled,
  helper,
  className,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  helper?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={className || "block"}>
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7a8594]">{label}</span>
      <input
        type="text"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] font-medium text-[#202020] outline-none focus:border-[#c9a44b]"
      />
      {helper ? <span className="mt-1.5 block text-[12px] leading-[1.5] text-[#7a8594]">{helper}</span> : null}
    </label>
  );
}

function IconTile({
  label,
  selected,
  icon,
  onClick,
}: {
  label: string;
  selected: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-[14px] border px-3 py-2 text-left text-[13px] font-semibold transition ${
        selected ? "border-[#c9a44b] bg-[#fff8e7] text-[#202020]" : "border-black/8 bg-[#faf8f3] text-[#5f6c79] hover:border-black/12 hover:bg-white"
      }`}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202020] shadow-[0_4px_14px_rgba(20,24,27,0.08)]">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function ColorTile({
  label,
  swatchStyle,
  selected,
  onClick,
}: {
  label: string;
  swatchStyle: React.CSSProperties;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-[14px] border px-3 py-2 text-left text-[13px] font-semibold transition ${
        selected ? "border-[#c9a44b] bg-[#fff8e7] text-[#202020]" : "border-black/8 bg-[#faf8f3] text-[#5f6c79] hover:border-black/12 hover:bg-white"
      }`}
    >
      <span className="inline-flex h-8 w-8 rounded-full border border-black/8 shadow-[0_4px_14px_rgba(20,24,27,0.08)]" style={swatchStyle} />
      <span>{label}</span>
    </button>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M11.4 1.8c.4 0 .7.2.9.5.2.3.2.7.1 1l-1.4 4h4c.4 0 .8.2.9.6.2.4.1.8-.2 1.1l-7 8.2a1 1 0 0 1-1.8-.9l1.4-4.1H4.4c-.4 0-.8-.2-.9-.6-.2-.4-.1-.8.2-1.1l7-8.2c.2-.3.4-.5.7-.5Z" />
    </svg>
  );
}

function ProductBadgeIcon({ iconKey, iconUrl }: { iconKey?: string | null; iconUrl?: string | null }) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="h-3.5 w-3.5 object-contain" aria-hidden="true" />;
  }
  if (iconKey === "cursor") return <CursorClickIcon />;
  if (iconKey === "trophy") return <BestSellerIcon />;
  if (iconKey === "trend") return <TrendingNowIcon />;
  if (iconKey === "star") return <RisingStarIcon />;
  if (iconKey === "bolt") return <BoltIcon />;
  return <SparkIcon />;
}

function IconPicker({
  label,
  selectedKey,
  disabled,
  onChange,
}: {
  label: string;
  selectedKey: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7a8594]">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PRODUCT_ENGAGEMENT_BADGE_ICON_OPTIONS.map((option) => (
          <IconTile
            key={option.key}
            label={option.label}
            selected={selectedKey === option.key}
            icon={<ProductBadgeIcon iconKey={option.key} />}
            onClick={() => {
              if (!disabled) onChange(option.key);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  selectedKey,
  disabled,
  onChange,
}: {
  label: string;
  selectedKey: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7a8594]">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PRODUCT_ENGAGEMENT_BADGE_COLOR_OPTIONS.map((option) => (
          <ColorTile
            key={option.key}
            label={option.label}
            swatchStyle={{ backgroundColor: option.backgroundColor }}
            selected={selectedKey === option.key}
            onClick={() => {
              if (!disabled) onChange(option.key);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BadgePreview({
  label,
  colorKey,
  backgroundColor,
  foregroundColor,
  icon,
  description,
}: {
  label: string;
  colorKey: string;
  backgroundColor: string;
  foregroundColor: string;
  icon: React.ReactNode;
  description: string;
}) {
  const badgeStyle = getBadgeColorStyle({ presetKey: colorKey, backgroundColor, foregroundColor });
  return (
    <div className="rounded-[18px] border border-black/8 bg-[linear-gradient(180deg,#ffffff_0%,#fbfbfb_100%)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Live preview</p>
      <div className="mt-3">
        <span
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.08em] shadow-[0_8px_20px_rgba(20,24,27,0.12)]"
          style={badgeStyle}
        >
          {icon}
          {label}
        </span>
      </div>
      <p className="mt-3 text-[13px] leading-[1.55] text-[#6a7684]">{description}</p>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M10 1.5c.4 0 .7.2.9.6l1.5 3.6 3.9.3c.4 0 .8.3.9.7.1.4 0 .8-.4 1.1l-3 2.6.9 3.8c.1.4-.1.8-.4 1.1-.3.2-.8.3-1.2 0L10 13.4l-3.3 1.9c-.4.2-.8.2-1.2 0-.3-.3-.5-.7-.4-1.1l.9-3.8-3-2.6c-.3-.3-.5-.7-.4-1.1.1-.4.5-.7.9-.7l3.9-.3 1.5-3.6c.2-.4.5-.6.9-.6Z" />
    </svg>
  );
}

function CursorClickIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M6.4 2.8c.3 0 .5.2.7.4l4.9 7.8c.2.3.2.7 0 1-.2.3-.5.5-.9.5l-2.3.2 1.8 3.3c.3.5.1 1.1-.4 1.4-.5.3-1.1.1-1.4-.4L7 13.8l-1.7 1.7c-.3.3-.7.4-1 .2-.4-.2-.6-.5-.6-.9V3.8c0-.4.2-.7.6-.9.1-.1.3-.1.5-.1Z" />
    </svg>
  );
}

function BestSellerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M6 2.5h8v3.2l-1.5 2.3a5 5 0 1 1-5 0L6 5.7V2.5Zm2 1.8v.9l1.7 2.5-.7.4A3.2 3.2 0 1 0 11 8l-.7-.4L12 5.2v-.9H8Z" />
    </svg>
  );
}

function TrendingNowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M4 13.5 8 9.5l2.5 2.5L16 6.5V10h1.5V4H11v1.5h3.4l-3.9 3.9L8 6.9 3 11.9l1 1.6Z" />
    </svg>
  );
}

function RisingStarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M10 2.2 11.8 6l4.2.6-3 2.9.7 4.1-3.7-2-3.8 2 .7-4.1-3-2.9 4.2-.6L10 2.2Zm0 9.9 1.7.9-.3-1.9 1.4-1.4-1.9-.3-.9-1.7-.9 1.7-1.9.3 1.4 1.4-.3 1.9 1.7-.9Z" />
    </svg>
  );
}

function BadgeAppearanceControls({
  colorKey,
  backgroundColor,
  foregroundColor,
  disabled,
  onColorKeyChange,
  onBackgroundColorChange,
  onForegroundColorChange,
}: {
  colorKey: string;
  backgroundColor: string;
  foregroundColor: string;
  disabled?: boolean;
  onColorKeyChange: (value: string) => void;
  onBackgroundColorChange: (value: string) => void;
  onForegroundColorChange: (value: string) => void;
}) {
  const preset = getBadgeColorPreset(colorKey);
  return (
    <div className="space-y-4 rounded-[18px] border border-black/8 bg-[#fcfbf8] p-4">
      <ColorPicker label="Preset" selectedKey={colorKey} disabled={disabled} onChange={onColorKeyChange} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput
          label="Background color"
          value={backgroundColor}
          disabled={disabled}
          helper={`Hex value. Preset default: ${preset.backgroundColor}`}
          onChange={onBackgroundColorChange}
        />
        <TextInput
          label="Text and icon color"
          value={foregroundColor}
          disabled={disabled}
          helper={`Hex value. Preset default: ${preset.foregroundColor}`}
          onChange={onForegroundColorChange}
        />
      </div>
    </div>
  );
}

function BadgeIconControls({
  selectedKey,
  customIconUrl,
  uploading,
  disabled,
  onIconKeyChange,
  onCustomIconUrlChange,
  onUploadClick,
}: {
  selectedKey: string;
  customIconUrl: string;
  uploading?: boolean;
  disabled?: boolean;
  onIconKeyChange: (value: string) => void;
  onCustomIconUrlChange: (value: string) => void;
  onUploadClick: () => void;
}) {
  return (
    <div className="space-y-4 rounded-[18px] border border-black/8 bg-[#fcfbf8] p-4">
      <IconPicker label="Preset icon" selectedKey={selectedKey} disabled={disabled} onChange={onIconKeyChange} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-start">
        <TextInput
          label="Custom icon URL"
          value={customIconUrl}
          disabled={disabled}
          className="min-w-0"
          helper="Paste an `https://...` icon URL or a local `/...` asset path, or upload an icon. Leave blank to use the preset icon."
          onChange={onCustomIconUrlChange}
        />
        <div className="pt-[1.9rem]">
          <SecondaryButton onClick={onUploadClick} disabled={disabled || uploading}>
            {uploading ? "Uploading..." : "Upload icon"}
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}

function BadgeRuleCard({
  title,
  description,
  preview,
  children,
}: {
  title: string;
  description: string;
  preview: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_10px_28px_rgba(20,24,27,0.05)]">
      <div className="grid gap-5 xl:grid-cols-[1.2fr_340px]">
        <div>
          <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-[#202020]">{title}</h3>
          <p className="mt-2 max-w-[64ch] text-[14px] leading-[1.65] text-[#5f6c79]">{description}</p>
          <div className="mt-4 space-y-4">{children}</div>
        </div>
        <div>{preview}</div>
      </div>
    </section>
  );
}

export function SellerAdminBadgeSettingsWorkspace() {
  const [badgeSettings, setBadgeSettings] = useState({
    windowDays: 30,
    bestSellerEnabled: true,
    bestSellerUnitsThreshold: 8,
    bestSellerIcon: "trophy",
    bestSellerIconUrl: "",
    bestSellerColor: "green",
    bestSellerBackgroundColor: "#1a8553",
    bestSellerForegroundColor: "#ffffff",
    popularEnabled: true,
    popularClicksThreshold: 10,
    popularIcon: "cursor",
    popularIconUrl: "",
    popularColor: "blue",
    popularBackgroundColor: "#145af2",
    popularForegroundColor: "#ffffff",
    trendingNowEnabled: true,
    trendingNowUnitsThreshold: 4,
    trendingNowGrowthMultiplier: 1.5,
    trendingNowIcon: "trend",
    trendingNowIconUrl: "",
    trendingNowColor: "slate",
    trendingNowBackgroundColor: "#596579",
    trendingNowForegroundColor: "#ffffff",
    risingStarEnabled: true,
    risingStarScoreThreshold: 20,
    risingStarClickThreshold: 4,
    risingStarIcon: "spark",
    risingStarIconUrl: "",
    risingStarColor: "amber",
    risingStarBackgroundColor: "#ff7a18",
    risingStarForegroundColor: "#ffffff",
    updatedAt: "",
    updatedBy: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingBadgeIcon, setUploadingBadgeIcon] = useState<string | null>(null);
  const iconUploadInputRef = useRef<HTMLInputElement | null>(null);
  const iconUploadTargetRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    async function loadBadgeSettings() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/admin/product-engagement-badges", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load badge settings.");
        if (!cancelled && payload?.settings) {
          setBadgeSettings((current) => ({
            ...current,
            ...payload.settings,
            bestSellerIconUrl: normalizeBadgeIconUrl(payload?.settings?.bestSellerIconUrl, ""),
            bestSellerBackgroundColor: normalizeBadgeHexColor(payload?.settings?.bestSellerBackgroundColor, "#1a8553"),
            bestSellerForegroundColor: normalizeBadgeHexColor(payload?.settings?.bestSellerForegroundColor, "#ffffff"),
            popularIconUrl: normalizeBadgeIconUrl(payload?.settings?.popularIconUrl, ""),
            popularBackgroundColor: normalizeBadgeHexColor(payload?.settings?.popularBackgroundColor, "#145af2"),
            popularForegroundColor: normalizeBadgeHexColor(payload?.settings?.popularForegroundColor, "#ffffff"),
            trendingNowIconUrl: normalizeBadgeIconUrl(payload?.settings?.trendingNowIconUrl, ""),
            trendingNowBackgroundColor: normalizeBadgeHexColor(payload?.settings?.trendingNowBackgroundColor, "#596579"),
            trendingNowForegroundColor: normalizeBadgeHexColor(payload?.settings?.trendingNowForegroundColor, "#ffffff"),
            risingStarIconUrl: normalizeBadgeIconUrl(payload?.settings?.risingStarIconUrl, ""),
            risingStarBackgroundColor: normalizeBadgeHexColor(payload?.settings?.risingStarBackgroundColor, "#ff7a18"),
            risingStarForegroundColor: normalizeBadgeHexColor(payload?.settings?.risingStarForegroundColor, "#ffffff"),
          }));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load badge settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBadgeSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadBadgeIcon(target: string, file: File | null) {
    if (!file || !target) return;
    setUploadingBadgeIcon(target);
    setError(null);
    try {
      const safeName = String(file.name || "badge-icon")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const path = `system/badge-icons/${target}/${Date.now()}-${safeName || "icon"}`;
      const fileRef = storageRef(clientStorage, path);
      await uploadBytes(fileRef, file, { contentType: file.type || "image/png" });
      const imageUrl = await getDownloadURL(fileRef);
      setBadgeSettings((current) => {
        if (target === "bestSeller") return { ...current, bestSellerIconUrl: imageUrl };
        if (target === "popular") return { ...current, popularIconUrl: imageUrl };
        if (target === "trendingNow") return { ...current, trendingNowIconUrl: imageUrl };
        if (target === "risingStar") return { ...current, risingStarIconUrl: imageUrl };
        return current;
      });
      setMessage("Badge icon uploaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload badge icon.");
    } finally {
      setUploadingBadgeIcon(null);
      if (iconUploadInputRef.current) iconUploadInputRef.current.value = "";
      iconUploadTargetRef.current = "";
    }
  }

  async function saveBadgeSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/admin/product-engagement-badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            windowDays: toNum(badgeSettings.windowDays),
            bestSellerEnabled: Boolean(badgeSettings.bestSellerEnabled),
            bestSellerUnitsThreshold: toNum(badgeSettings.bestSellerUnitsThreshold),
            bestSellerIcon: String(badgeSettings.bestSellerIcon || "trophy"),
            bestSellerIconUrl: normalizeBadgeIconUrl(badgeSettings.bestSellerIconUrl, ""),
            bestSellerColor: String(badgeSettings.bestSellerColor || "green"),
            bestSellerBackgroundColor: normalizeBadgeHexColor(badgeSettings.bestSellerBackgroundColor, "#1a8553"),
            bestSellerForegroundColor: normalizeBadgeHexColor(badgeSettings.bestSellerForegroundColor, "#ffffff"),
            popularEnabled: Boolean(badgeSettings.popularEnabled),
            popularClicksThreshold: toNum(badgeSettings.popularClicksThreshold),
            popularIcon: String(badgeSettings.popularIcon || "cursor"),
            popularIconUrl: normalizeBadgeIconUrl(badgeSettings.popularIconUrl, ""),
            popularColor: String(badgeSettings.popularColor || "blue"),
            popularBackgroundColor: normalizeBadgeHexColor(badgeSettings.popularBackgroundColor, "#145af2"),
            popularForegroundColor: normalizeBadgeHexColor(badgeSettings.popularForegroundColor, "#ffffff"),
            trendingNowEnabled: Boolean(badgeSettings.trendingNowEnabled),
            trendingNowUnitsThreshold: toNum(badgeSettings.trendingNowUnitsThreshold),
            trendingNowGrowthMultiplier: Number(badgeSettings.trendingNowGrowthMultiplier || 0),
            trendingNowIcon: String(badgeSettings.trendingNowIcon || "trend"),
            trendingNowIconUrl: normalizeBadgeIconUrl(badgeSettings.trendingNowIconUrl, ""),
            trendingNowColor: String(badgeSettings.trendingNowColor || "slate"),
            trendingNowBackgroundColor: normalizeBadgeHexColor(badgeSettings.trendingNowBackgroundColor, "#596579"),
            trendingNowForegroundColor: normalizeBadgeHexColor(badgeSettings.trendingNowForegroundColor, "#ffffff"),
            risingStarEnabled: Boolean(badgeSettings.risingStarEnabled),
            risingStarScoreThreshold: toNum(badgeSettings.risingStarScoreThreshold),
            risingStarClickThreshold: toNum(badgeSettings.risingStarClickThreshold),
            risingStarIcon: String(badgeSettings.risingStarIcon || "spark"),
            risingStarIconUrl: normalizeBadgeIconUrl(badgeSettings.risingStarIconUrl, ""),
            risingStarColor: String(badgeSettings.risingStarColor || "amber"),
            risingStarBackgroundColor: normalizeBadgeHexColor(badgeSettings.risingStarBackgroundColor, "#ff7a18"),
            risingStarForegroundColor: normalizeBadgeHexColor(badgeSettings.risingStarForegroundColor, "#ffffff"),
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save badge settings.");
      if (payload?.settings) {
        setBadgeSettings((current) => ({
          ...current,
          ...payload.settings,
          bestSellerIconUrl: normalizeBadgeIconUrl(payload?.settings?.bestSellerIconUrl, ""),
          bestSellerBackgroundColor: normalizeBadgeHexColor(payload?.settings?.bestSellerBackgroundColor, "#1a8553"),
          bestSellerForegroundColor: normalizeBadgeHexColor(payload?.settings?.bestSellerForegroundColor, "#ffffff"),
          popularIconUrl: normalizeBadgeIconUrl(payload?.settings?.popularIconUrl, ""),
          popularBackgroundColor: normalizeBadgeHexColor(payload?.settings?.popularBackgroundColor, "#145af2"),
          popularForegroundColor: normalizeBadgeHexColor(payload?.settings?.popularForegroundColor, "#ffffff"),
          trendingNowIconUrl: normalizeBadgeIconUrl(payload?.settings?.trendingNowIconUrl, ""),
          trendingNowBackgroundColor: normalizeBadgeHexColor(payload?.settings?.trendingNowBackgroundColor, "#596579"),
          trendingNowForegroundColor: normalizeBadgeHexColor(payload?.settings?.trendingNowForegroundColor, "#ffffff"),
          risingStarIconUrl: normalizeBadgeIconUrl(payload?.settings?.risingStarIconUrl, ""),
          risingStarBackgroundColor: normalizeBadgeHexColor(payload?.settings?.risingStarBackgroundColor, "#ff7a18"),
          risingStarForegroundColor: normalizeBadgeHexColor(payload?.settings?.risingStarForegroundColor, "#ffffff"),
        }));
      }
      setMessage("Badge settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save badge settings.");
    } finally {
      setSaving(false);
    }
  }

  const windowSummary = useMemo(() => `${badgeSettings.windowDays} day window`, [badgeSettings.windowDays]);

  return (
    <div className="space-y-5">
      <input
        ref={iconUploadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          void uploadBadgeIcon(iconUploadTargetRef.current, file);
        }}
      />
      <section className="overflow-hidden rounded-[28px] border border-black/6 bg-[radial-gradient(circle_at_top_left,rgba(245,241,231,0.92),transparent_42%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-[0_14px_34px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8b94a3]">Badge settings</p>
            <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-[#202020]">Product badge controls</h2>
            <p className="mt-3 max-w-[72ch] text-[15px] leading-[1.7] text-[#5f6c79]">
              Tune the four shopper-facing product badges from one place. Set the recent window once, then decide what counts as Best seller,
              Popular, Trending now, and Rising star.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={windowSummary} tone="slate" />
            <StatusPill label={badgeSettings.updatedAt ? `Updated ${formatDateTime(badgeSettings.updatedAt)}` : "Using default settings"} tone="slate" />
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_10px_28px_rgba(20,24,27,0.05)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,240px)_1fr] xl:items-end">
          <FieldInput
            label="Shared recent window"
            value={String(badgeSettings.windowDays)}
            min={1}
            max={90}
            disabled={loading || saving}
            helper="All badges look only at fresh sales and engagement inside this window."
            onChange={(value) => setBadgeSettings((current) => ({ ...current, windowDays: toNum(value) }))}
          />
          <div className="rounded-[18px] border border-black/8 bg-[#faf8f3] px-4 py-4">
            <p className="text-[13px] font-semibold text-[#202020]">How this works</p>
            <p className="mt-2 text-[13px] leading-[1.65] text-[#6a7684]">
              A badge is not permanent. If a product stops performing inside the last {badgeSettings.windowDays} days, it loses the badge automatically.
            </p>
          </div>
        </div>
      </section>

      <BadgeRuleCard
        title="Best seller"
        description="Use this for products with the strongest recent sales volume. This is the highest-confidence commercial badge."
        preview={
          <BadgePreview
            label="Best seller"
            colorKey={String(badgeSettings.bestSellerColor || "green")}
            backgroundColor={String(badgeSettings.bestSellerBackgroundColor || "#1a8553")}
            foregroundColor={String(badgeSettings.bestSellerForegroundColor || "#ffffff")}
            icon={<ProductBadgeIcon iconKey={badgeSettings.bestSellerIcon} iconUrl={badgeSettings.bestSellerIconUrl} />}
            description={`Shows when a product sells at least ${badgeSettings.bestSellerUnitsThreshold} units in the last ${badgeSettings.windowDays} days.`}
          />
        }
      >
        <ToggleRow
          checked={Boolean(badgeSettings.bestSellerEnabled)}
          disabled={loading || saving}
          label="Show Best seller badge"
          description="Turn this off if you want to hide sales-volume badges across the storefront."
          onChange={(next) => setBadgeSettings((current) => ({ ...current, bestSellerEnabled: next }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FieldInput
            label="Minimum units sold"
            value={String(badgeSettings.bestSellerUnitsThreshold)}
            min={1}
            max={9999}
            disabled={loading || saving}
            helper="Products must sell at least this many units inside the recent window."
            onChange={(value) => setBadgeSettings((current) => ({ ...current, bestSellerUnitsThreshold: toNum(value) }))}
          />
        </div>
        <BadgeIconControls
          selectedKey={String(badgeSettings.bestSellerIcon || "trophy")}
          customIconUrl={String(badgeSettings.bestSellerIconUrl || "")}
          uploading={uploadingBadgeIcon === "bestSeller"}
          disabled={loading || saving}
          onIconKeyChange={(value) => setBadgeSettings((current) => ({ ...current, bestSellerIcon: value }))}
          onCustomIconUrlChange={(value) => setBadgeSettings((current) => ({ ...current, bestSellerIconUrl: value }))}
          onUploadClick={() => {
            iconUploadTargetRef.current = "bestSeller";
            iconUploadInputRef.current?.click();
          }}
        />
        <BadgeAppearanceControls
          colorKey={String(badgeSettings.bestSellerColor || "green")}
          backgroundColor={String(badgeSettings.bestSellerBackgroundColor || "#1a8553")}
          foregroundColor={String(badgeSettings.bestSellerForegroundColor || "#ffffff")}
          disabled={loading || saving}
          onColorKeyChange={(value) =>
            setBadgeSettings((current) => {
              const preset = getBadgeColorPreset(value);
              return {
                ...current,
                bestSellerColor: value,
                bestSellerBackgroundColor: preset.backgroundColor,
                bestSellerForegroundColor: preset.foregroundColor,
              };
            })
          }
          onBackgroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, bestSellerBackgroundColor: value }))}
          onForegroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, bestSellerForegroundColor: value }))}
        />
      </BadgeRuleCard>

      <BadgeRuleCard
        title="Popular"
        description="Use this when you want to spotlight products getting strong shopper click activity, even if they are not top sellers yet."
        preview={
          <BadgePreview
            label="Popular"
            colorKey={String(badgeSettings.popularColor || "blue")}
            backgroundColor={String(badgeSettings.popularBackgroundColor || "#145af2")}
            foregroundColor={String(badgeSettings.popularForegroundColor || "#ffffff")}
            icon={<ProductBadgeIcon iconKey={badgeSettings.popularIcon} iconUrl={badgeSettings.popularIconUrl} />}
            description={`Shows when a product earns at least ${badgeSettings.popularClicksThreshold} clicks in the last ${badgeSettings.windowDays} days.`}
          />
        }
      >
        <ToggleRow
          checked={Boolean(badgeSettings.popularEnabled)}
          disabled={loading || saving}
          label="Show Popular badge"
          description="Use this as the high-click shopper-interest badge across product cards."
          onChange={(next) => setBadgeSettings((current) => ({ ...current, popularEnabled: next }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FieldInput
            label="Minimum clicks"
            value={String(badgeSettings.popularClicksThreshold)}
            min={1}
            max={9999}
            disabled={loading || saving}
            helper="Products must hit this click count inside the recent window."
            onChange={(value) => setBadgeSettings((current) => ({ ...current, popularClicksThreshold: toNum(value) }))}
          />
        </div>
        <BadgeIconControls
          selectedKey={String(badgeSettings.popularIcon || "cursor")}
          customIconUrl={String(badgeSettings.popularIconUrl || "")}
          uploading={uploadingBadgeIcon === "popular"}
          disabled={loading || saving}
          onIconKeyChange={(value) => setBadgeSettings((current) => ({ ...current, popularIcon: value }))}
          onCustomIconUrlChange={(value) => setBadgeSettings((current) => ({ ...current, popularIconUrl: value }))}
          onUploadClick={() => {
            iconUploadTargetRef.current = "popular";
            iconUploadInputRef.current?.click();
          }}
        />
        <BadgeAppearanceControls
          colorKey={String(badgeSettings.popularColor || "blue")}
          backgroundColor={String(badgeSettings.popularBackgroundColor || "#145af2")}
          foregroundColor={String(badgeSettings.popularForegroundColor || "#ffffff")}
          disabled={loading || saving}
          onColorKeyChange={(value) =>
            setBadgeSettings((current) => {
              const preset = getBadgeColorPreset(value);
              return {
                ...current,
                popularColor: value,
                popularBackgroundColor: preset.backgroundColor,
                popularForegroundColor: preset.foregroundColor,
              };
            })
          }
          onBackgroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, popularBackgroundColor: value }))}
          onForegroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, popularForegroundColor: value }))}
        />
      </BadgeRuleCard>

      <BadgeRuleCard
        title="Trending now"
        description="Use this for products whose sales are accelerating quickly right now. It is less about total volume and more about momentum."
        preview={
          <BadgePreview
            label="Trending now"
            colorKey={String(badgeSettings.trendingNowColor || "slate")}
            backgroundColor={String(badgeSettings.trendingNowBackgroundColor || "#596579")}
            foregroundColor={String(badgeSettings.trendingNowForegroundColor || "#ffffff")}
            icon={<ProductBadgeIcon iconKey={badgeSettings.trendingNowIcon} iconUrl={badgeSettings.trendingNowIconUrl} />}
            description={`Shows when a product sells at least ${badgeSettings.trendingNowUnitsThreshold} units and grows by ${badgeSettings.trendingNowGrowthMultiplier}x versus the previous ${badgeSettings.windowDays}-day window.`}
          />
        }
      >
        <ToggleRow
          checked={Boolean(badgeSettings.trendingNowEnabled)}
          disabled={loading || saving}
          label="Show Trending now badge"
          description="Use this to highlight products with sharp short-term sales acceleration."
          onChange={(next) => setBadgeSettings((current) => ({ ...current, trendingNowEnabled: next }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FieldInput
            label="Minimum units sold"
            value={String(badgeSettings.trendingNowUnitsThreshold)}
            min={1}
            max={9999}
            disabled={loading || saving}
            helper="Products need this base sales volume before growth is considered meaningful."
            onChange={(value) => setBadgeSettings((current) => ({ ...current, trendingNowUnitsThreshold: toNum(value) }))}
          />
          <FieldInput
            label="Growth multiplier"
            value={String(badgeSettings.trendingNowGrowthMultiplier)}
            min={1.1}
            max={10}
            step={0.1}
            disabled={loading || saving}
            helper="Compares this window against the previous one. Example: `1.5` means 50% faster sales."
            onChange={(value) => setBadgeSettings((current) => ({ ...current, trendingNowGrowthMultiplier: Number(value || 0) }))}
          />
        </div>
        <BadgeIconControls
          selectedKey={String(badgeSettings.trendingNowIcon || "trend")}
          customIconUrl={String(badgeSettings.trendingNowIconUrl || "")}
          uploading={uploadingBadgeIcon === "trendingNow"}
          disabled={loading || saving}
          onIconKeyChange={(value) => setBadgeSettings((current) => ({ ...current, trendingNowIcon: value }))}
          onCustomIconUrlChange={(value) => setBadgeSettings((current) => ({ ...current, trendingNowIconUrl: value }))}
          onUploadClick={() => {
            iconUploadTargetRef.current = "trendingNow";
            iconUploadInputRef.current?.click();
          }}
        />
        <BadgeAppearanceControls
          colorKey={String(badgeSettings.trendingNowColor || "slate")}
          backgroundColor={String(badgeSettings.trendingNowBackgroundColor || "#596579")}
          foregroundColor={String(badgeSettings.trendingNowForegroundColor || "#ffffff")}
          disabled={loading || saving}
          onColorKeyChange={(value) =>
            setBadgeSettings((current) => {
              const preset = getBadgeColorPreset(value);
              return {
                ...current,
                trendingNowColor: value,
                trendingNowBackgroundColor: preset.backgroundColor,
                trendingNowForegroundColor: preset.foregroundColor,
              };
            })
          }
          onBackgroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, trendingNowBackgroundColor: value }))}
          onForegroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, trendingNowForegroundColor: value }))}
        />
      </BadgeRuleCard>

      <BadgeRuleCard
        title="Rising star"
        description="Use this for products building real traction early. It helps surface promising products before they graduate into Popular or Best seller."
        preview={
          <BadgePreview
            label="Rising star"
            colorKey={String(badgeSettings.risingStarColor || "amber")}
            backgroundColor={String(badgeSettings.risingStarBackgroundColor || "#ff7a18")}
            foregroundColor={String(badgeSettings.risingStarForegroundColor || "#ffffff")}
            icon={<ProductBadgeIcon iconKey={badgeSettings.risingStarIcon} iconUrl={badgeSettings.risingStarIconUrl} />}
            description={`Shows when a product reaches at least ${badgeSettings.risingStarClickThreshold} clicks and an engagement score of ${badgeSettings.risingStarScoreThreshold} in the last ${badgeSettings.windowDays} days.`}
          />
        }
      >
        <ToggleRow
          checked={Boolean(badgeSettings.risingStarEnabled)}
          disabled={loading || saving}
          label="Show Rising star badge"
          description="Use this to surface products that are gaining traction but have not yet reached the top engagement tier."
          onChange={(next) => setBadgeSettings((current) => ({ ...current, risingStarEnabled: next }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FieldInput
            label="Minimum engagement score"
            value={String(badgeSettings.risingStarScoreThreshold)}
            min={1}
            max={9999}
            disabled={loading || saving}
            helper="A combined score from views, clicks, and other engagement signals."
            onChange={(value) => setBadgeSettings((current) => ({ ...current, risingStarScoreThreshold: toNum(value) }))}
          />
          <FieldInput
            label="Minimum clicks"
            value={String(badgeSettings.risingStarClickThreshold)}
            min={1}
            max={9999}
            disabled={loading || saving}
            helper="Prevents very low-signal products from receiving the badge."
            onChange={(value) => setBadgeSettings((current) => ({ ...current, risingStarClickThreshold: toNum(value) }))}
          />
        </div>
        <BadgeIconControls
          selectedKey={String(badgeSettings.risingStarIcon || "spark")}
          customIconUrl={String(badgeSettings.risingStarIconUrl || "")}
          uploading={uploadingBadgeIcon === "risingStar"}
          disabled={loading || saving}
          onIconKeyChange={(value) => setBadgeSettings((current) => ({ ...current, risingStarIcon: value }))}
          onCustomIconUrlChange={(value) => setBadgeSettings((current) => ({ ...current, risingStarIconUrl: value }))}
          onUploadClick={() => {
            iconUploadTargetRef.current = "risingStar";
            iconUploadInputRef.current?.click();
          }}
        />
        <BadgeAppearanceControls
          colorKey={String(badgeSettings.risingStarColor || "amber")}
          backgroundColor={String(badgeSettings.risingStarBackgroundColor || "#ff7a18")}
          foregroundColor={String(badgeSettings.risingStarForegroundColor || "#ffffff")}
          disabled={loading || saving}
          onColorKeyChange={(value) =>
            setBadgeSettings((current) => {
              const preset = getBadgeColorPreset(value);
              return {
                ...current,
                risingStarColor: value,
                risingStarBackgroundColor: preset.backgroundColor,
                risingStarForegroundColor: preset.foregroundColor,
              };
            })
          }
          onBackgroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, risingStarBackgroundColor: value }))}
          onForegroundColorChange={(value) => setBadgeSettings((current) => ({ ...current, risingStarForegroundColor: value }))}
        />
      </BadgeRuleCard>

      {error ? (
        <div className="rounded-[18px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] font-semibold text-[#b91c1c]">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-[18px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[13px] font-semibold text-[#166534]">
          {message}
        </div>
      ) : null}

      <section className="sticky bottom-4 z-10 rounded-[20px] border border-black/6 bg-white/95 px-4 py-4 shadow-[0_12px_32px_rgba(20,24,27,0.12)] backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <StatusPill label={`${badgeSettings.bestSellerEnabled ? "Best seller on" : "Best seller off"} • ${windowSummary}`} tone="green" />
            <StatusPill label={`${badgeSettings.popularEnabled ? "Popular on" : "Popular off"} • ${windowSummary}`} tone="blue" />
            <StatusPill label={`${badgeSettings.trendingNowEnabled ? "Trending now on" : "Trending now off"} • ${windowSummary}`} tone="slate" />
            <StatusPill label={`${badgeSettings.risingStarEnabled ? "Rising star on" : "Rising star off"} • ${windowSummary}`} tone="amber" />
          </div>
          <SaveButton onClick={saveBadgeSettings}>{saving ? "Saving..." : "Save badge settings"}</SaveButton>
        </div>
      </section>
    </div>
  );
}

export default SellerAdminBadgeSettingsWorkspace;
