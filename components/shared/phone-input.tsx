"use client";

const COUNTRY_OPTIONS = [
  { code: "27", label: "ZA", prefix: "+27" },
  { code: "1", label: "US", prefix: "+1" },
  { code: "44", label: "UK", prefix: "+44" },
  { code: "61", label: "AU", prefix: "+61" },
  { code: "49", label: "DE", prefix: "+49" },
];

export function splitPhoneNumber(value: string, fallbackCode = "27") {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D+/g, "");
  if (!digits) {
    return { countryCode: fallbackCode, localNumber: "" };
  }

  const normalized = raw.startsWith("+") ? digits : digits;
  const matched = COUNTRY_OPTIONS.find((option) => normalized.startsWith(option.code));
  if (raw.startsWith("+") && matched) {
    return {
      countryCode: matched.code,
      localNumber: normalized.slice(matched.code.length),
    };
  }

  return {
    countryCode: fallbackCode,
    localNumber: digits,
  };
}

export function combinePhoneNumber(countryCode: string, localNumber: string) {
  const cc = String(countryCode || "").replace(/\D+/g, "");
  const local = String(localNumber || "").replace(/\D+/g, "");
  if (!cc && !local) return "";
  if (!local) return cc ? `+${cc}` : "";
  return `+${cc}${local}`;
}

type PhoneInputProps = {
  label?: string;
  countryCode: string;
  localNumber: string;
  onCountryCodeChange: (value: string) => void;
  onLocalNumberChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
};

export function PhoneInput({
  label = "Mobile number",
  countryCode,
  localNumber,
  onCountryCodeChange,
  onLocalNumberChange,
  disabled = false,
  hint,
}: PhoneInputProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-semibold text-[#202020]">{label}</span>
      <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-2">
        <select
          value={countryCode}
          onChange={(event) => onCountryCodeChange(event.target.value)}
          disabled={disabled}
          className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] outline-none focus:border-[#cbb26b] disabled:bg-[#fafafa] disabled:text-[#8b94a3]"
        >
          {COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label} {option.prefix}
            </option>
          ))}
        </select>
        <input
          inputMode="numeric"
          autoComplete="tel-national"
          value={localNumber}
          onChange={(event) => onLocalNumberChange(event.target.value.replace(/\D+/g, ""))}
          disabled={disabled}
          placeholder="Enter phone number"
          className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[14px] outline-none focus:border-[#cbb26b] disabled:bg-[#fafafa] disabled:text-[#8b94a3]"
        />
      </div>
      {hint ? <span className="mt-2 block text-[12px] text-[#7a7a7a]">{hint}</span> : null}
    </label>
  );
}
