import Link from "next/link";
import Image from "next/image";
import { PageBody } from "@/components/layout/page-body";
import { FooterAppActions } from "@/components/pwa/footer-app-actions";
import { COMPANY_PUBLIC_DETAILS } from "@/lib/company/public-details";

const FOOTER_COLUMNS = [
  {
    title: "About",
    items: [],
  },
  {
    title: "Shop",
    items: ["Categories", "Deals", "New arrivals", "Clearance"],
  },
  {
    title: "Account",
    items: ["My account", "Orders", "Lists", "Help"],
  },
  {
    title: "Help",
    items: ["Contact us", "Delivery", "Returns", "Payments"],
  },
  {
    title: "Company",
    items: ["About Piessang", "Sell on Piessang", "Seller fees and charges", "Terms", "Privacy", "Sitemap"],
  },
];

export function PiessangFooter() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <PageBody as="div" className="py-8 lg:py-10">
        <div className="grid gap-8 text-center sm:grid-cols-2 sm:text-left lg:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="min-w-0">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">
                {column.title}
              </h2>
              {column.title === "About" ? (
                <div className="mx-auto mt-4 flex max-w-[22ch] flex-col items-center space-y-4 text-[13px] leading-[1.6] text-[#57636c] sm:mx-0 sm:items-start">
                  <Image
                    src="/logo/Piessang%20Logo.png"
                    alt="Piessang"
                    width={164}
                    height={44}
                    className="h-9 w-auto object-contain"
                  />
                  <p>
                    Piessang is a curated marketplace built to help suppliers, brands, and sellers
                    grow with simpler tools, clearer fulfilment, and a premium buying experience.
                  </p>
                  <div className="space-y-1 text-[12px] leading-[1.6] text-[#57636c]">
                    <p>{COMPANY_PUBLIC_DETAILS.addressLines[0]}</p>
                    <p>{COMPANY_PUBLIC_DETAILS.addressLines[1]}</p>
                    <p>{COMPANY_PUBLIC_DETAILS.addressLines[2]}</p>
                    <p>{COMPANY_PUBLIC_DETAILS.supportPhone}</p>
                    <a
                      href={`mailto:${COMPANY_PUBLIC_DETAILS.supportEmail}`}
                      className="transition-colors hover:text-[#202020]"
                    >
                      {COMPANY_PUBLIC_DETAILS.supportEmail}
                    </a>
                  </div>
                </div>
              ) : (
                <ul className="mt-4 space-y-2 text-[13px] text-[#57636c]">
                  {column.items.map((item) => (
                    <li key={item}>
                      <Link
                        href={
                          item === "Categories"
                            ? "/categories"
                            : item === "Deals"
                              ? "/products?onSale=true"
                              : item === "New arrivals"
                                ? "/products?newArrivals=true"
                              : item === "Orders"
                                ? "/account?section=orders"
                                : item === "Lists"
                                  ? "/account?section=lists"
                                  : item === "Help"
                                    ? "/account?section=support"
                                    : item === "My account"
                                      ? "/account"
                                      : item === "Sell on Piessang"
                                        ? "/sell-on-piessang"
                                      : item === "About Piessang"
                                        ? "/about"
                                        : item === "Seller fees and charges"
                                          ? "/fees"
                                        : item === "Contact us"
                                          ? "/contact"
                                        : item === "Delivery"
                                          ? "/delivery"
                                          : item === "Returns"
                                            ? "/returns"
                                              : item === "Payments"
                                              ? "/payments"
                                              : item === "Privacy"
                                                ? "/privacy"
                                                : item === "Terms"
                                                  ? "/terms"
                                                  : item === "Sitemap"
                                                    ? "/sitemap.xml"
                                        : "/"
                        }
                        className="transition-colors hover:text-[#202020]"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-black/5 pt-5">
          <div className="w-full">
            <FooterAppActions />
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 border-t border-black/5 pt-6 text-center text-[12px] text-[#8b94a3] lg:flex-row lg:items-center lg:justify-between lg:text-left">
          <p>© {new Date().getFullYear()} Piessang. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-end">
            <p>Marketplace, simplified.</p>
            <Image
              src="/badges/Stripe%20Secure%20Checkout%20Badge.png"
              alt="Stripe Secure Checkout"
              width={160}
              height={40}
              className="h-8 w-auto object-contain"
            />
          </div>
        </div>
      </PageBody>
    </footer>
  );
}
