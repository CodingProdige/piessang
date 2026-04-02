"use client";

import { useEffect } from "react";

type OutsideDismissOptions = {
  refs?: Array<React.RefObject<HTMLElement | null>>;
  selectors?: string[];
};

export function useOutsideDismiss(
  enabled: boolean,
  onDismiss: () => void,
  options: OutsideDismissOptions = {},
) {
  const { refs = [], selectors = [] } = options;

  useEffect(() => {
    if (!enabled) return undefined;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;

      for (const ref of refs) {
        if (ref.current?.contains(target)) return;
      }

      if (target instanceof Element) {
        for (const selector of selectors) {
          if (target.closest(selector)) return;
        }
      }

      onDismiss();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [enabled, onDismiss, refs, selectors]);
}
