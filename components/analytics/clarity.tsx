"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type ClarityProps = {
  projectId?: string;
};

function normalizeProjectId(value: string | undefined) {
  return String(value || "").trim();
}

function isSensitivePath(pathname: string) {
  return (
    pathname.startsWith("/account") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/seller") ||
    pathname.startsWith("/support")
  );
}

export function Clarity({ projectId }: ClarityProps) {
  const pathname = usePathname();
  const normalizedProjectId = normalizeProjectId(projectId);
  const shouldBlock = isSensitivePath(pathname || "");

  useEffect(() => {
    if (shouldBlock) return;
    if (!normalizedProjectId) return;
    if (document.getElementById("clarity-script")) return;

    const script = document.createElement("script");
    script.id = "clarity-script";
    script.async = true;
    script.innerHTML = `
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/" + i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${normalizedProjectId}");
    `;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [normalizedProjectId, shouldBlock]);

  return null;
}

export function ClarityPrivacyBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const shouldMask = isSensitivePath(pathname || "");

  return <div data-clarity-mask={shouldMask ? "true" : undefined}>{children}</div>;
}

export default Clarity;
