import test from "node:test";
import assert from "node:assert/strict";
import { resolveShippingForSellerGroup } from "@/lib/shipping/resolve";

const baseSeller = {
  id: "seller_1",
  shippingSettings: {
    shipsFrom: {
      countryCode: "ZA",
      province: "Western Cape",
      city: "Paarl",
      postalCode: "7646",
      streetAddress: "6 Christelle Street",
      addressLine2: "",
      suburb: "Denneburg",
      utcOffsetMinutes: 120,
      latitude: null,
      longitude: null,
    },
    localDelivery: {
      enabled: true,
      mode: "province",
      provinces: [
        {
          province: "Western Cape",
          enabled: true,
          rateOverride: {
            pricingMode: "flat",
            flatRate: 80,
            weightBased: { baseRate: 0, includedKg: 0, additionalRatePerKg: 0, roundUpToNextKg: true },
            orderValueBased: [],
            tiered: [],
            freeOverThreshold: { threshold: 0, fallbackRate: 0 },
          },
          batching: {
            enabled: true,
            mode: "single_shipping_fee",
            maxBatchLimit: null,
          },
          estimatedDeliveryDays: { min: 1, max: 3 },
        },
      ],
      postalCodeGroups: [],
      defaultRate: {
        pricingMode: "flat",
        flatRate: 0,
        weightBased: { baseRate: 0, includedKg: 0, additionalRatePerKg: 0, roundUpToNextKg: true },
        orderValueBased: [],
        tiered: [],
        freeOverThreshold: { threshold: 0, fallbackRate: 0 },
      },
      batching: {
        enabled: true,
        mode: "single_shipping_fee",
        maxBatchLimit: null,
      },
      estimatedDeliveryDays: { min: 1, max: 3 },
      currency: "ZAR",
    },
    zones: [
      {
        id: "za-country",
        name: "South Africa",
        enabled: true,
        countryCode: "ZA",
        coverageType: "country",
        provinces: [],
        postalCodeGroups: [],
        defaultRate: {
          pricingMode: "flat",
          flatRate: 120,
          weightBased: { baseRate: 0, includedKg: 0, additionalRatePerKg: 0, roundUpToNextKg: true },
          orderValueBased: [],
          tiered: [],
          freeOverThreshold: { threshold: 0, fallbackRate: 0 },
        },
        batching: {
          enabled: true,
          mode: "single_shipping_fee",
          maxBatchLimit: null,
        },
        estimatedDeliveryDays: { min: 2, max: 5 },
        currency: "ZAR",
      },
    ],
  },
};

const baseItems = [{ quantity: 1, lineSubtotalIncl: 100, product: {}, product_snapshot: {}, selected_variant: null, selected_variant_snapshot: null }];

test("local province match succeeds for exact seller/shopper province scenario", () => {
  const result = resolveShippingForSellerGroup({
    seller: baseSeller,
    items: baseItems,
    buyerDestination: {
      countryCode: "ZA",
      province: "Western Cape",
      city: "Paarl",
      postalCode: "7646",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "local_delivery");
  assert.equal(result.matchType, "province");
  assert.equal(result.matchedRuleName, "Western Cape");
});

test("local postal exact match succeeds", () => {
  const seller = {
    ...baseSeller,
    shippingSettings: {
      ...baseSeller.shippingSettings,
      localDelivery: {
        ...baseSeller.shippingSettings.localDelivery,
        mode: "postal_code_group",
        provinces: [],
        postalCodeGroups: [
          {
            name: "Paarl exact",
            postalCodes: ["7646"],
            postalCodeRanges: [],
            rateOverride: baseSeller.shippingSettings.localDelivery.provinces[0].rateOverride,
            batching: baseSeller.shippingSettings.localDelivery.provinces[0].batching,
            estimatedDeliveryDays: { min: 1, max: 2 },
          },
        ],
      },
    },
  };

  const result = resolveShippingForSellerGroup({
    seller,
    items: baseItems,
    buyerDestination: { countryCode: "ZA", province: "Western Cape", city: "Paarl", postalCode: "7646" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "local_delivery");
  assert.equal(result.matchType, "postal_exact");
});

test("local postal range match succeeds", () => {
  const seller = {
    ...baseSeller,
    shippingSettings: {
      ...baseSeller.shippingSettings,
      localDelivery: {
        ...baseSeller.shippingSettings.localDelivery,
        mode: "postal_code_group",
        provinces: [],
        postalCodeGroups: [
          {
            name: "Cape range",
            postalCodes: [],
            postalCodeRanges: [{ from: "7600", to: "7699" }],
            rateOverride: baseSeller.shippingSettings.localDelivery.provinces[0].rateOverride,
            batching: baseSeller.shippingSettings.localDelivery.provinces[0].batching,
            estimatedDeliveryDays: { min: 1, max: 2 },
          },
        ],
      },
    },
  };

  const result = resolveShippingForSellerGroup({
    seller,
    items: baseItems,
    buyerDestination: { countryCode: "ZA", province: "Western Cape", city: "Paarl", postalCode: "7646" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "local_delivery");
  assert.equal(result.matchType, "postal_range");
});

test("local postal exact match tolerates leading zero differences", () => {
  const seller = {
    ...baseSeller,
    shippingSettings: {
      ...baseSeller.shippingSettings,
      localDelivery: {
        ...baseSeller.shippingSettings.localDelivery,
        mode: "postal_code_group",
        provinces: [],
        postalCodeGroups: [
          {
            name: "Pretoria exact",
            postalCodes: ["0200"],
            postalCodeRanges: [],
            rateOverride: baseSeller.shippingSettings.localDelivery.provinces[0].rateOverride,
            batching: baseSeller.shippingSettings.localDelivery.provinces[0].batching,
            estimatedDeliveryDays: { min: 1, max: 2 },
          },
        ],
      },
    },
  };

  const result = resolveShippingForSellerGroup({
    seller,
    items: baseItems,
    buyerDestination: { countryCode: "ZA", province: "Gauteng", city: "Pretoria", postalCode: "200" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "local_delivery");
  assert.equal(result.matchType, "postal_exact");
});

test("local postal range match tolerates leading zero differences", () => {
  const seller = {
    ...baseSeller,
    shippingSettings: {
      ...baseSeller.shippingSettings,
      localDelivery: {
        ...baseSeller.shippingSettings.localDelivery,
        mode: "postal_code_group",
        provinces: [],
        postalCodeGroups: [
          {
            name: "Pretoria range",
            postalCodes: [],
            postalCodeRanges: [{ from: "0001", to: "0299" }],
            rateOverride: baseSeller.shippingSettings.localDelivery.provinces[0].rateOverride,
            batching: baseSeller.shippingSettings.localDelivery.provinces[0].batching,
            estimatedDeliveryDays: { min: 1, max: 2 },
          },
        ],
      },
    },
  };

  const result = resolveShippingForSellerGroup({
    seller,
    items: baseItems,
    buyerDestination: { countryCode: "ZA", province: "Gauteng", city: "Pretoria", postalCode: "200" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "local_delivery");
  assert.equal(result.matchType, "postal_range");
});

test("local delivery mode controls whether postal groups are used", () => {
  const seller = {
    ...baseSeller,
    shippingSettings: {
      ...baseSeller.shippingSettings,
      localDelivery: {
        ...baseSeller.shippingSettings.localDelivery,
        mode: "province",
        provinces: [
          {
            ...baseSeller.shippingSettings.localDelivery.provinces[0],
            province: "Gauteng",
            enabled: true,
          },
        ],
        postalCodeGroups: [
          {
            name: "Paarl exact",
            postalCodes: ["7646"],
            postalCodeRanges: [],
            rateOverride: {
              ...baseSeller.shippingSettings.localDelivery.provinces[0].rateOverride,
              flatRate: 65,
            },
            batching: baseSeller.shippingSettings.localDelivery.provinces[0].batching,
            estimatedDeliveryDays: { min: 1, max: 2 },
          },
        ],
      },
      zones: [],
    },
  };

  const result = resolveShippingForSellerGroup({
    seller,
    items: baseItems,
    buyerDestination: { countryCode: "ZA", province: "Western Cape", city: "Paarl", postalCode: "7646" },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "SELLER_DOES_NOT_SHIP_TO_LOCATION");
});

test("local postal exact match succeeds when seller country is saved as a label", () => {
  const seller = {
    ...baseSeller,
    shippingSettings: {
      ...baseSeller.shippingSettings,
      shipsFrom: {
        ...baseSeller.shippingSettings.shipsFrom,
        countryCode: "South Africa",
      },
      localDelivery: {
        ...baseSeller.shippingSettings.localDelivery,
        mode: "postal_code_group",
        provinces: [],
        postalCodeGroups: [
          {
            name: "Paarl exact",
            postalCodes: ["7646"],
            postalCodeRanges: [],
            rateOverride: baseSeller.shippingSettings.localDelivery.provinces[0].rateOverride,
            batching: baseSeller.shippingSettings.localDelivery.provinces[0].batching,
            estimatedDeliveryDays: { min: 1, max: 2 },
          },
        ],
      },
      zones: [],
    },
  };

  const result = resolveShippingForSellerGroup({
    seller,
    items: baseItems,
    buyerDestination: { countryCode: "ZA", province: "Western Cape", city: "Paarl", postalCode: "7646" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "local_delivery");
  assert.equal(result.matchType, "postal_exact");
  assert.equal(result.matchedRuleName, "Paarl exact");
});

test("shipping zone country match succeeds", () => {
  const seller = {
    ...baseSeller,
    shippingSettings: {
      ...baseSeller.shippingSettings,
      localDelivery: {
        ...baseSeller.shippingSettings.localDelivery,
        enabled: false,
        provinces: [],
      },
    },
  };

  const result = resolveShippingForSellerGroup({
    seller,
    items: baseItems,
    buyerDestination: { countryCode: "ZA", province: "Gauteng", city: "Johannesburg", postalCode: "2000" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "shipping_zone");
  assert.equal(result.matchType, "country");
});

test("malformed province normalization still matches Western Cape", () => {
  const result = resolveShippingForSellerGroup({
    seller: baseSeller,
    items: baseItems,
    buyerDestination: {
      countryCode: "ZA",
      province: "western_cape",
      city: "Paarl",
      postalCode: "7646",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedSource, "local_delivery");
  assert.equal(result.matchType, "province");
});
