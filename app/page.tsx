import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Shop Piessang for curated products from trusted sellers, with secure checkout, delivery support, and account tools built for repeat buying.",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-[1180px] px-3 py-8 lg:px-4">
      <section className="rounded-[8px] bg-white p-6 text-[14px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        The header and footer now live in the shared app shell. We can build the homepage rails under this without changing the global structure.
      </section>
    </main>
  );
}
