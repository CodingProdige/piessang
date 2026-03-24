"use client";

import { useAuth } from "@/components/auth/auth-provider";

type RegisterSellerButtonProps = {
  label: string;
  className?: string;
  message?: string;
};

export function RegisterSellerButton({ label, className, message }: RegisterSellerButtonProps) {
  const { openSellerRegistrationModal } = useAuth();

  return (
    <button
      type="button"
      onClick={() => openSellerRegistrationModal(message ?? "Register your seller account to unlock catalogue tools.")}
      className={className}
    >
      {label}
    </button>
  );
}
