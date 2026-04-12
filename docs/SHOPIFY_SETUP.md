# Shopify app setup for Piessang

This document explains how to configure Shopify so any Piessang seller can connect their own Shopify store.

## Core idea

Piessang should have one Shopify app of its own.

You do **not** create a separate Shopify app per seller.
You do **not** need a fake or random merchant store so other sellers can connect.

Instead:

- Piessang owns one Shopify app
- that app has one client ID and one client secret
- each seller authorizes that same Piessang app against their own Shopify store
- Shopify issues a store-specific access token after each seller approves access

## What you need to create

Create one Shopify app for Piessang.

That app will supply:

- app client ID
- app client secret

## Environment variables

Set these in the Piessang environment:

- `SHOPIFY_APP_CLIENT_ID`
- `SHOPIFY_APP_CLIENT_SECRET`

The current implementation also accepts these fallback names:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`

Webhook verification now uses `SHOPIFY_APP_CLIENT_SECRET` by default.

Optional override:

- `SHOPIFY_WEBHOOK_SECRET`

Recommended: use `SHOPIFY_APP_CLIENT_ID` and `SHOPIFY_APP_CLIENT_SECRET`, and only set `SHOPIFY_WEBHOOK_SECRET` if you deliberately want a separate override in Piessang.

## Redirect URL to register in Shopify

Register this callback URL in the Shopify app settings:

`https://your-domain.com/api/client/v1/accounts/seller/shopify/callback`

For local development, use your local tunnel or dev URL equivalent.

Examples:

- production: `https://piessang.com/api/client/v1/accounts/seller/shopify/callback`
- local tunnel: `https://your-ngrok-or-dev-domain/api/client/v1/accounts/seller/shopify/callback`

The redirect URL in Shopify must match the callback URL your app uses.

## Current flow in Piessang

The seller experience now works like this:

1. Seller opens `Seller Dashboard > Integrations`
2. Seller enters their Shopify domain, for example `their-store.myshopify.com`
3. Seller clicks `Connect Shopify`
4. Piessang redirects them to Shopify
5. Shopify asks them to approve access
6. Shopify redirects back to Piessang
7. Piessang exchanges the code for a store-specific access token
8. Piessang saves the connection and loads the Shopify preview

For continuous updates, Piessang also exposes a seller Shopify webhook endpoint:

`https://your-domain.com/api/client/v1/accounts/seller/shopify/webhook`

That endpoint is intended for Shopify webhook delivery and should use the app's webhook secret for signature verification.
In Piessang, that means the app client secret by default unless you explicitly override it with `SHOPIFY_WEBHOOK_SECRET`.
Piessang now auto-registers the required Shopify webhook subscriptions immediately after a seller completes the OAuth connection flow.

## Shopify scopes currently expected

The integration currently asks for:

- `read_products`
- `read_inventory`
- `read_locations`
- `read_product_listings`

These are defined in the onboarding layer and used during OAuth authorization.

## Sync ownership rules

Piessang treats Shopify as the source of truth for:

- product reads and previews
- stock updates
- price updates
- optional new product draft creation

Piessang remains the source of truth for:

- category
- subcategory
- moderation
- fulfilment settings
- publishing state

Seller-selected category and subcategory values in Piessang should never be overwritten by Shopify sync.
When Piessang creates a new draft product from Shopify, it uses Piessang-generated 8-digit IDs for both the product and each variant instead of reusing Shopify IDs as primary catalogue identifiers.

## Files involved

OAuth and onboarding logic currently lives in:

- [components/seller/integrations-workspace.tsx](/Users/dillonjurgens/Dev/piessang-platform/components/seller/integrations-workspace.tsx)
- [app/api/client/v1/accounts/seller/shopify/authorize/route.js](/Users/dillonjurgens/Dev/piessang-platform/app/api/client/v1/accounts/seller/shopify/authorize/route.js)
- [app/api/client/v1/accounts/seller/shopify/callback/route.js](/Users/dillonjurgens/Dev/piessang-platform/app/api/client/v1/accounts/seller/shopify/callback/route.js)
- [app/api/client/v1/accounts/seller/shopify/route.js](/Users/dillonjurgens/Dev/piessang-platform/app/api/client/v1/accounts/seller/shopify/route.js)
- [app/api/client/v1/accounts/seller/shopify/webhook/route.js](/Users/dillonjurgens/Dev/piessang-platform/app/api/client/v1/accounts/seller/shopify/webhook/route.js)
- [lib/integrations/shopify-onboarding.js](/Users/dillonjurgens/Dev/piessang-platform/lib/integrations/shopify-onboarding.js)

## Important note about modern Shopify installs

Shopify currently recommends Shopify-managed installation for embedded apps in many cases, which can reduce the amount of classic OAuth redirect handling you need to maintain.

The Piessang implementation right now uses a standard redirect-based OAuth-style flow, which is a practical and valid starting point for this seller integration.

If you later decide to move to Shopify-managed installation, you can keep the seller-facing `Connect Shopify` UX and swap the backend installation mechanics.

## Troubleshooting

### Seller clicks Connect Shopify and gets an error immediately

Check:

- `SHOPIFY_APP_CLIENT_ID` is set
- `SHOPIFY_APP_CLIENT_SECRET` is set
- the callback URL is registered in Shopify

### Seller can approve access but does not return connected

Check:

- the callback URL configured in Shopify matches the deployed callback route exactly
- the environment variables are available in the deployment environment
- the seller still has an active Piessang session during the callback

### Seller connects the wrong store

The domain entered in Piessang controls which Shopify store starts the authorization flow.

Ask the seller to use their Shopify admin domain in this format:

`their-store.myshopify.com`

## Recommended rollout

For the first rollout:

- keep `Import once` as the default
- keep manual setup available as a support fallback
- verify a small number of seller stores first
- confirm preview quality and mapping before encouraging broader adoption
- enable webhook subscriptions before promoting `Ongoing sync`
