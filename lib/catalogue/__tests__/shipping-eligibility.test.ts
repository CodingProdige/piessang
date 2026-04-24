import test from "node:test";
import assert from "node:assert/strict";

import { resolveProductShippingEligibility, type ShippingEligibilityProductInput, type ShippingEligibilitySellerInput } from "@/lib/catalogue/shipping-eligibility";
import type { ShopperLocation } from "@/lib/shopper/location";

function buildSeller(overrides: Partial<ShippingEligibilitySellerInput> = {}): ShippingEligibilitySellerInput {
  return {
    fulfillmentMode: "seller",
    origin: {
      countryCode: "ZA",
      lat: -33.734,
      lng: 18.962,
    },
    deliveryProfile: {
      directDelivery: {
        enabled: true,
        radiusKm: 25,
        leadTimeDays: 2,
      },
      pickup: {
        enabled: true,
        leadTimeDays: 1,
      },
    },
    courierProfile: {
      enabled: true,
      internationalEnabled: true,
      handoverMode: "pickup",
    },
    ...overrides,
  };
}

function buildProduct(overrides: Partial<ShippingEligibilityProductInput> = {}): ShippingEligibilityProductInput {
  return {
    placement: {
      isActive: true,
      blocked: false,
    },
    fulfillment: {
      mode: "seller",
    },
    listable: true,
    shipping: {
      courierEnabled: true,
    },
    variants: [
      {
        logistics: {
          weight_kg: 0.5,
          length_cm: 20,
          width_cm: 15,
          height_cm: 5,
        },
      },
    ],
    ...overrides,
  };
}

function buildLocation(overrides: Partial<ShopperLocation> = {}): ShopperLocation {
  return {
    countryCode: "ZA",
    lat: -33.738,
    lng: 18.968,
    source: "manual",
    precision: "coordinates",
    ...overrides,
  };
}

test("no shopper location leaves product not visible when no fulfillment method can be validated", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct(),
    seller: buildSeller(),
    shopperLocation: {
      source: "none",
      precision: "none",
    },
    context: {},
  });

  assert.equal(result.isVisible, false);
  assert.equal(result.isPurchasable, false);
  assert.equal(result.fulfillmentType, "none");
});

test("local eligible resolves visible local delivery with ETA", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct(),
    seller: buildSeller(),
    shopperLocation: buildLocation(),
    context: {
      courierRouteSupported: false,
    },
  });

  assert.equal(result.localDeliveryEligible, true);
  assert.equal(result.isVisible, true);
  assert.equal(result.fulfillmentType, "local_delivery");
  assert.equal(result.estimatedMinDays, 2);
  assert.equal(result.estimatedMaxDays, 2);
  assert.equal(result.deliveryPromiseLabel, "Get it in 2 days");
  assert.equal(result.deliveryTone, "success");
});

test("outside local radius disables local delivery", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct({ shipping: { courierEnabled: false } }),
    seller: buildSeller(),
    shopperLocation: buildLocation({
      lat: -26.2041,
      lng: 28.0473,
    }),
    context: {},
  });

  assert.equal(result.localDeliveryEligible, false);
  assert.equal(result.isVisible, false);
  assert.equal(result.eligibilityReason, "outside_local_radius");
});

test("courier eligible requires full pre-eligibility and remains visible without ETA promise", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct(),
    seller: buildSeller({
      deliveryProfile: {
        directDelivery: {
          enabled: true,
          radiusKm: 5,
          leadTimeDays: 2,
        },
        pickup: {
          enabled: false,
        },
      },
    }),
    shopperLocation: buildLocation({
      countryCode: "US",
      lat: null,
      lng: null,
      precision: "country",
    }),
    context: {
      courierRouteSupported: true,
    },
  });

  assert.equal(result.courierEligible, true);
  assert.equal(result.isVisible, true);
  assert.equal(result.fulfillmentType, "courier");
  assert.equal(result.estimatedMinDays, null);
  assert.equal(result.deliveryMessage, "Shipping available");
  assert.equal(result.deliveryPromiseLabel, null);
  assert.equal(result.deliveryTone, "success");
});

test("missing parcel metadata blocks courier visibility", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct({
      variants: [
        {
          logistics: {
            weight_kg: null,
            length_cm: null,
            width_cm: null,
            height_cm: null,
          },
        },
      ],
    }),
    seller: buildSeller({
      deliveryProfile: {
        directDelivery: {
          enabled: false,
          radiusKm: 0,
          leadTimeDays: 2,
        },
      },
    }),
    shopperLocation: buildLocation({
      countryCode: "US",
      lat: null,
      lng: null,
      precision: "country",
    }),
    context: {
      courierRouteSupported: true,
    },
  });

  assert.equal(result.courierEligible, false);
  assert.equal(result.isVisible, false);
  assert.equal(result.eligibilityReason, "seller_local_disabled");
});

test("same-country collection is eligible", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct({
      shipping: {
        courierEnabled: false,
      },
    }),
    seller: buildSeller({
      deliveryProfile: {
        directDelivery: {
          enabled: false,
          radiusKm: 0,
          leadTimeDays: 2,
        },
        pickup: {
          enabled: true,
          leadTimeDays: 1,
        },
      },
    }),
    shopperLocation: buildLocation({
      countryCode: "ZA",
      lat: null,
      lng: null,
      precision: "country",
    }),
    context: {
      courierRouteSupported: false,
    },
  });

  assert.equal(result.collectionEligible, true);
  assert.equal(result.isVisible, true);
  assert.equal(result.fulfillmentType, "collection");
});

test("cross-border collection is not eligible", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct({
      shipping: {
        courierEnabled: false,
      },
    }),
    seller: buildSeller({
      deliveryProfile: {
        directDelivery: {
          enabled: false,
          radiusKm: 0,
          leadTimeDays: 2,
        },
        pickup: {
          enabled: true,
          leadTimeDays: 1,
        },
      },
    }),
    shopperLocation: buildLocation({
      countryCode: "US",
      lat: null,
      lng: null,
      precision: "country",
    }),
    context: {
      courierRouteSupported: false,
    },
  });

  assert.equal(result.collectionEligible, false);
  assert.equal(result.isVisible, false);
});

test("no valid fulfillment method means product is not visible", () => {
  const result = resolveProductShippingEligibility({
    product: buildProduct({
      shipping: {
        courierEnabled: false,
      },
      localDeliveryEnabled: false,
      collectionEnabled: false,
    }),
    seller: buildSeller({
      deliveryProfile: {
        directDelivery: {
          enabled: false,
          radiusKm: 0,
          leadTimeDays: 2,
        },
        pickup: {
          enabled: false,
          leadTimeDays: 1,
        },
      },
      courierProfile: {
        enabled: false,
      },
    }),
    shopperLocation: buildLocation(),
    context: {
      courierRouteSupported: false,
    },
  });

  assert.equal(result.availableMethods.length, 0);
  assert.equal(result.isVisible, false);
  assert.equal(result.isPurchasable, false);
});
