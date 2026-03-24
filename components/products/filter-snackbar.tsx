"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export function FilterSnackbar() {
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [searchParams.toString()]);

  return (
    <div
      className={`fixed bottom-4 left-1/2 z-40 -translate-x-1/2 transition-all duration-200 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <div className="rounded-[8px] bg-[#202020] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(20,24,27,0.2)]">
        Filters updated
      </div>
    </div>
  );
}
