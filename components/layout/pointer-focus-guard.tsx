"use client";

import { useEffect } from "react";

function isPointerFocusableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const interactive = target.closest<HTMLElement>("a[href], button, [role='button']");
  if (!interactive) return false;
  if (interactive.hasAttribute("data-keep-pointer-focus")) return false;
  return true;
}

export function PointerFocusGuard() {
  useEffect(() => {
    function handlePointerUp(event: PointerEvent) {
      if (!isPointerFocusableTarget(event.target)) return;
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;
        if (!active.matches("a[href], button, [role='button']")) return;
        if (active.hasAttribute("data-keep-pointer-focus")) return;
        active.blur();
      });
    }

    document.addEventListener("pointerup", handlePointerUp, true);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp, true);
    };
  }, []);

  return null;
}

export default PointerFocusGuard;
