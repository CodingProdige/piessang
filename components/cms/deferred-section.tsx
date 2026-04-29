export function DeferredSection({
  children,
  minHeight = 320,
  eager = false,
}: {
  children: React.ReactNode;
  minHeight?: number;
  eager?: boolean;
}) {
  if (eager || minHeight <= 0) {
    return <div className="w-full">{children}</div>;
  }

  return (
    <div
      className="w-full"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: `${Math.max(160, Math.round(minHeight))}px`,
      }}
    >
      {children}
    </div>
  );
}

export default DeferredSection;
