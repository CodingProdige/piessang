# Delivery Architecture

## Goal

Make delivery simple for sellers, strict at checkout, and extensible enough to support live courier rates later.

For Piessang, the right split is:

- seller shipping promise
- product or variant parcel facts
- rating and checkout enforcement
- courier adapters

If we keep those concerns separate, we can support flat local delivery today and live courier rates later without turning seller settings into a mess.

## Current Product Decisions

These are the rules we should build around:

- seller settings must stay simple
- local delivery should be `radius + flat fee`
- shipping should be `country + shipping cost`
- checkout must re-validate live seller delivery rules before order creation
- categories and subcategories stay seller-managed in Piessang
- pre-loved products need friendlier upload flows than grocery-style variants
- apparel should support sizes like `S`, `M`, `L`, `XL`, `XXL`
- parcel math belongs in shipping logic, not in the seller-facing merchandising form

## The 4 Layers

### 1. Seller Shipping Promise

This is the only delivery configuration most sellers should ever touch.

#### Local delivery

- enabled
- origin
- radiusKm
- flatFee
- freeAboveOrderValue
- leadTimeDays
- cutoffTime

#### Country shipping

- enabled rows
- each row has:
  - country
  - flatFee
  - freeAboveOrderValue
  - leadTimeDays
  - cutoffTime

#### Collection

- enabled
- leadTimeDays

This should stay human-friendly. Sellers should not be configuring distance bands, postal scopes, region trees, or courier API logic in this screen.

### 2. Variant Shipping Profile

This belongs on the product or variant, not in seller delivery settings.

Merchandising data and shipping data should be separate.

Recommended shipping profile fields:

- `parcelPreset`
- `actualWeightKg`
- `lengthCm`
- `widthCm`
- `heightCm`
- `volumetricWeightKg`
- `billableWeightKg`
- `shippingClass`
- `fragile`
- `hazmat`
- `temperatureControlled`

Recommended merchandising fields that are not shipping facts:

- `size`
- `condition`
- `colour`
- `material`

For fashion and pre-loved, presets should do most of the work. A seller should be able to say:

- `fashion_satchel`
- `shoe_box`
- `small_accessory`
- `standard_box`
- `bulky_box`

and let Piessang derive the parcel math behind the scenes.

### 3. Rating Engine

This decides:

- whether a delivery method is available
- which method wins
- what it costs
- what ETA to show
- which courier service is returned when live rates are enabled

The engine should evaluate in this order:

1. collection if the shopper selected collection and the seller allows it
2. seller local delivery if destination is within the seller radius
3. seller country shipping if destination country is configured
4. live courier rates if seller shipping allows that destination and a courier account is connected
5. unavailable

Checkout should never trust stale cart delivery data. It must re-rate from live seller settings and the current destination.

### 4. Courier Adapter Layer

Every courier integration should implement the same contract:

- `getRates`
- `createShipment`
- `trackShipment`
- `cancelShipment`

That gives us one rating engine and one checkout flow while still supporting:

- DHL
- FedEx
- UPS
- Aramex
- local South African couriers
- courier aggregators

## What The Seller Should Actually See

### Seller settings

Keep the settings UI simple:

- local delivery radius
- local delivery fee
- countries shipped to
- shipping cost per country
- collection enabled or not

### Product upload

Do not force every seller into raw volumetric fields up front.

For normal products:

- use parcel preset first
- optionally allow weight and dimensions

For clothing:

- size should be first-class
- volume should not be the primary variant concept

For pre-loved:

- condition should be first-class
- size should be available where relevant
- category and subcategory stay manual in Piessang

## Suggested Runtime Flow

### Product page

- read seller shipping promise
- estimate local delivery eligibility from shopper area
- estimate country shipping from shopper country
- show only methods that are plausibly available

### Cart

- group by seller and fulfilment mode
- resolve delivery again using the latest cart address
- show delivery-unavailable warnings before checkout

### Checkout

- re-read live seller delivery settings
- re-rate every seller group
- block order creation if any seller-delivered group is not eligible
- persist the live delivery breakdown onto the order

### Post-order

- if seller uses flat shipping, keep the chosen rate snapshot on the order
- if seller uses a courier integration, persist:
  - carrier
  - service
  - billable weight
  - quoted amount
  - shipment identifiers
  - tracking info

## Data Model

### Seller shipping profile

This is the ideal normalized shape Piessang should grow toward:

```ts
type SellerShippingProfile = {
  origin: {
    country: string;
    region: string;
    city: string;
    suburb: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
    utcOffsetMinutes: number | null;
  };
  localDelivery: {
    enabled: boolean;
    radiusKm: number;
    flatFee: number;
    freeAboveOrderValue: number | null;
    leadTimeDays: number;
    cutoffTime: string | null;
  };
  countryShipping: Array<{
    id: string;
    country: string;
    flatFee: number;
    freeAboveOrderValue: number | null;
    leadTimeDays: number;
    cutoffTime: string | null;
    isActive: boolean;
  }>;
  collection: {
    enabled: boolean;
    leadTimeDays: number;
  };
  notes: string;
};
```

Note: the current seller delivery storage still uses `directDelivery` and `shippingZones` in parts of the repo. That is acceptable as a compatibility layer, but new delivery logic should conceptually map those into `localDelivery` and `countryShipping`.

### Variant shipping profile

```ts
type VariantShippingProfile = {
  parcelPreset: string | null;
  actualWeightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  volumetricWeightKg: number | null;
  billableWeightKg: number | null;
  shippingClass: string | null;
  fragile: boolean;
  hazmat: boolean;
  temperatureControlled: boolean;
};
```

### Courier capability

Future seller courier settings should be separate from the seller shipping promise:

```ts
type SellerCourierConnection = {
  courierKey: string;
  enabled: boolean;
  mode: "platform_account" | "seller_account";
  accountReference: string | null;
  serviceAreaCountries: string[];
  defaultCollectionAddressId: string | null;
  createdAt: string;
  updatedAt: string;
};
```

## Pricing Strategy

### Phase 1

Use only:

- seller local delivery flat fee
- seller country flat fee
- collection

This is enough to make checkout correct and understandable.

### Phase 2

Introduce:

- parcel presets
- volumetric and billable weight logic
- shipping classes like:
  - `small_parcel`
  - `fashion_satchel`
  - `bulky`
  - `oversized`

### Phase 3

Add live courier rates:

- courier account connections
- real-time rate shopping
- service selection
- shipment booking
- labels
- tracking

## Courier Integration Strategy

The safest implementation path is:

1. flat local delivery and flat country shipping
2. parcel presets and billable-weight helpers
3. courier adapters
4. seller-linked courier accounts

For international and last-mile coverage, Piessang should support both:

- direct carrier adapters
- aggregator adapters

That keeps us flexible. Some sellers will want their own courier account pricing, while others will want the platform to source rates.

## Repo Mapping

Current key files:

- `lib/seller/delivery-profile.js`
- `lib/platform/delivery-settings.js`
- `app/api/client/v1/accounts/seller/settings/update/route.js`
- `app/api/catalogue/v1/carts/cart/fetchCart/route.js`
- `app/api/client/v1/orders/create/route.js`
- `components/seller/settings-workspace.tsx`
- `components/cart/cart-checkout.tsx`
- `app/seller/catalogue/new/page.tsx`

Current foundation files:

- `lib/shipping/contracts.ts`

Recommended next foundation files:

- `lib/shipping/rating.ts`
- `lib/shipping/parcel-presets.ts`
- `lib/shipping/normalize.ts`
- `lib/shipping/adapters/*`

## Non-Negotiable Rules

- seller settings define the shipping promise, not logistics math
- parcel facts belong on products or variants, not in seller settings
- checkout always re-rates from live data
- unavailable seller delivery must block order creation
- pre-loved and apparel flows must stay seller-friendly
- Piessang categories and subcategories stay merchant-managed, not auto-overwritten by external systems
