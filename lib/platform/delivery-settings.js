import {
  loadPlatformShippingSettings,
  normalizePlatformShippingSettings,
  savePlatformShippingSettings,
} from "@/lib/platform/shipping-settings";

export function normalizePlatformDeliveryProfile(profile = {}) {
  return profile && typeof profile === "object" ? { ...profile } : {};
}

export async function loadPlatformDeliverySettings() {
  const settings = await loadPlatformShippingSettings();
  return {
    deprecated: true,
    replacement: "/api/client/v1/admin/platform-shipping",
    deliveryProfile: {},
    shippingSettings: settings,
  };
}

export async function savePlatformDeliverySettings({ uid = "", deliveryProfile = {}, data = {} } = {}) {
  const settings = await savePlatformShippingSettings({
    uid,
    data: data && typeof data === "object" && Object.keys(data).length ? data : deliveryProfile,
  });
  return {
    deprecated: true,
    replacement: "/api/client/v1/admin/platform-shipping",
    deliveryProfile: {},
    shippingSettings: settings,
  };
}

export function normalizePlatformDeliverySettings(settings = {}) {
  return normalizePlatformShippingSettings(settings);
}

export async function resolvePlatformDeliveryOption() {
  return {
    available: false,
    kind: "deprecated",
    label: "Legacy platform delivery deprecated",
    amountIncl: 0,
    amountExcl: 0,
    leadTimeDays: null,
    cutoffTime: null,
    matchedRule: null,
    unavailableReasons: ["Legacy platform delivery resolution has been deprecated."],
    metadata: {
      deprecated: true,
      replacement: "lib/shipping/resolve.ts",
    },
  };
}
