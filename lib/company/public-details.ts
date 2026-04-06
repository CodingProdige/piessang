export const COMPANY_PUBLIC_DETAILS = {
  tradingName: "Piessang",
  legalName: "Piessang",
  supportEmail: "support@piessang.com",
  supportPhone: "021 818 6153",
  vatNumber: "4760314296",
  registrationNumber: "2023/779316/07",
  addressLines: [
    "Unit 2, 4 EK Green Str",
    "Charleston Hill, Paarl, 7646",
    "South Africa",
  ],
} as const;

export function companyAddressText() {
  return COMPANY_PUBLIC_DETAILS.addressLines.join(", ");
}
