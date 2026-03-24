type SellerPageIntroProps = {
  title: string;
  description: string;
  className?: string;
};

export function SellerPageIntro({ title, description, className = "" }: SellerPageIntroProps) {
  return (
    <section
      className={[
        "rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]",
        className,
      ].join(" ")}
    >
      <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">{title}</h1>
      <p className="mt-1.5 max-w-[820px] text-[13px] leading-[1.6] text-[#57636c]">{description}</p>
    </section>
  );
}
