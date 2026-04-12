# Shopify integration guide for sellers

This guide now separates the intended seller experience from the temporary manual fallback.

## Recommended experience

The preferred Shopify onboarding flow is:

1. The seller clicks `Connect Shopify` in Piessang.
2. The seller signs into Shopify.
3. The seller chooses the store to connect.
4. Shopify asks the seller to approve access.
5. The seller returns to Piessang already connected.
6. Piessang loads a product preview and lets the seller prepare the first import.

This is the simplest experience and matches how most sellers expect Shopify integrations to work.

## What Piessang should request from Shopify

For the first release, Piessang only needs read-oriented access for:

- products
- variants
- inventory
- store details needed for verification

If stock and price sync remain enabled later, those same product and inventory permissions continue to matter.

## Seller-facing onboarding copy

Use this short version when writing onboarding messages:

“Open Seller Dashboard > Integrations, click Connect Shopify, sign into Shopify, approve access, then return to Piessang to review your preview and prepare your first import.”

## After the seller connects

Once the Shopify login flow succeeds, Piessang should let the seller:

- confirm the connected shop
- review the latest product preview
- choose `Import once` or `Ongoing sync`
- decide whether Shopify should keep price and stock synced
- understand that category and subcategory stay managed in Piessang
- prepare a draft import

## What syncs first

The first Shopify rollout focuses on:

- product title
- product handle
- vendor name
- product status
- variant SKU
- barcode
- price
- compare-at price
- inventory quantity
- featured image

## What still stays in Piessang

The following still belong in Piessang:

- category
- subcategory
- moderation and approval flow
- seller delivery rules
- fulfilment setup
- marketplace publishing controls
- seller team access
- billing and settlement configuration

## Temporary fallback: manual setup

If OAuth is unavailable for a specific seller, the team can still connect stores manually.

### Before you start

Make sure you have:

- access to the Shopify store admin
- permission to create and install custom apps in Shopify
- the seller account already set up in Piessang

### Manual setup steps

1. In Shopify admin, go to `Settings`.
2. Open `Apps and sales channels`.
3. Open `Develop apps`.
4. Create a new custom app for the store.
5. Grant the Admin API scopes Piessang needs for products and inventory.
6. Install the custom app.
7. Copy the `Admin API access token`.
8. Copy the Shopify domain in the format `your-store.myshopify.com`.
9. In Piessang, open `Integrations`.
10. Expand `Advanced manual setup`.
11. Paste the shop domain and token.
12. Click `Verify connection`.
13. Save the setup.
14. Prepare the first draft import.

### Manual setup troubleshooting

If the manual connection fails, check:

- the domain is the Shopify domain, for example `your-store.myshopify.com`
- the token was copied correctly
- the custom app was installed
- the app has the required Admin API scopes

If the preview is empty, check:

- the store has products in Shopify
- the app can read products
- the correct store was connected
