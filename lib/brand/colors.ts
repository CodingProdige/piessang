export const PIESSANG_COLORS = {
  primary: "#CBB26B",
  primaryHover: "#B89E55",
  background: "#F9F9F7",
  surface: "#FFFFFF",
  textPrimary: "#1A1A1A",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
  neutralDark: "#2B2B2B",
  neutralLight: "#F4F0EB",
} as const;

export type PiessangColorToken = keyof typeof PIESSANG_COLORS;
