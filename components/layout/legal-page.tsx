"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({
  eyebrow,
  title,
  intro,
  body,
  content,
  updatedLabel,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  body?: string[];
  content?: ReactNode;
  updatedLabel: string;
}) {
  return (
    <main className="mx-auto w-full max-w-[980px] px-4 py-10 lg:px-6 lg:py-14">
      <div className="mb-8 rounded-[18px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)] lg:p-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">{eyebrow}</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#202020] lg:text-[44px]">
          {title}
        </h1>
        <p className="mt-4 max-w-[68ch] text-[15px] leading-7 text-[#57636c]">{intro}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-[13px] text-[#8b94a3]">
          <span>{updatedLabel}</span>
          <span className="text-black/15">•</span>
          <Link href="/account?section=support" className="font-medium text-[#0f80c3] hover:text-[#0a6ca8]">
            Contact support
          </Link>
        </div>
      </div>

      <section className="rounded-[18px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.05)] lg:p-8">
        {content ? (
          <div className="space-y-5 text-[15px] leading-7 text-[#57636c]">{content}</div>
        ) : (
          <div className="space-y-4 text-[15px] leading-7 text-[#57636c]">
            {(body ?? []).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
