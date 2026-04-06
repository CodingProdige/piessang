"use client";

import { AppSnackbar } from "@/components/ui/app-snackbar";

export function DocumentSnackbar({
  notice,
  onClose,
}: {
  notice: { tone: "info" | "success" | "error"; message: string } | null;
  onClose: () => void;
}) {
  return <AppSnackbar notice={notice} onClose={onClose} />;
}
