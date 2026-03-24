📘 README — /api/v1/carts/get (Full Refresh + Price/State Reconciliation)
Purpose

This endpoint is used whenever a customer opens their cart or the app needs to verify that the cart is still valid. It ensures the cart always reflects the latest product, variant, pricing, sale, stock, and customer-pricing rules.

It completely refreshes each cart item using the canonical product documents in Firestore, guaranteeing accuracy and preventing overselling or stale pricing.

🧠 Core Responsibilities
✔ 1. Load customer

Retrieves /users/{uid} for discountPercentage, rebate tiers, eligibility, pricing overrides, etc.

✔ 2. Load active cart

Retrieves /carts_active/{uid}.

If missing → return { cart: null }.

✔ 3. Refresh every item in the cart

For each cart item:

Fetch latest product from /products/{docId}

Validate that:

product still exists

variant still exists

product is active

variant is active

pricing structures haven't changed

sale flags haven't changed

sale qty hasn’t changed

inventory hasn't changed

If any of these fail → item removed from cart.

🔥 4. Recalculate sale/regular split

Following your logic:

Sale bucket takes priority.

Sale bucket limited by variant.sale.qty_available.

Regular bucket fills remainder.

If regular insufficient → shrink regular bucket first (M1 rule).

If stock insufficient → auto-reduce total qty (PS1 partial allocation).

If total = 0 → remove item (B1 out-of-stock rule).

Frontend never needs to know how many sale units remain — backend does ALL logic.

💸 5. Apply customer pricing model

Based on the user document:

Discount flow:
If customer.discountPercentage > 0:
    Ignore all rebates
    Apply discount to EXCL selling price

Rebate flow:
If discountPercentage = 0 AND rebateEligible = true:
    Apply customer rebate tier percentage

Special rules:

Sale items do not receive discounts or rebates.

Rentals never receive discounts or rebates.

Returnables and deposits recalculated.

🧮 6. Recalculate totals

Totals are NOT stored — only returned:

{
  "subtotal_excl": ...,
  "subtotal_incl": ...,
  "rebate_amount": ...,
  "sale_savings_excl": ...,
  "deposit_total_excl": ...,
  "final_excl": ...,
  "final_incl": ...
}


All VAT calculations use:

const VAT_RATE = 0.15;

⚠️ 7. Return warnings in W4 model

Structured warnings:

Global:

Stock shortage

Product removed

Variant discontinued

Cart-level:

Sale bucket realignment

Inventory changes detected

Item-level:

Qty reduced

Sale qty reduced

Item removed

This gives the frontend granular insight without hardcoding logic.

💾 8. Save refreshed cart

The refreshed snapshot is saved:

updated product snapshot

updated variant snapshot

updated qty

updated sale/regular split

updated timestamps

Totals are not saved.

🧹 9. Auto-delete empty cart

If all items removed due to sale/stock changes → cart doc is deleted.

📤 Request Format
POST /api/v1/carts/get
{
  "uid": "USER_ID"
}

📥 Response Format
{
  "ok": true,
  "data": {
    "cart": { ...cartSnapshot },
    "totals": { ...computedTotals },
    "warnings": {
      "global": [],
      "cart": [],
      "items": []
    }
  }
}


If the cart is empty:

{
  "ok": true,
  "data": {
    "cart": null,
    "totals": {},
    "warnings": { ... }
  }
}

🧩 In summary

/cart/get is the authoritative reconciliation engine:

No stale pricing

No stale inventory

No stale sale limits

No stale variant info

No outdated product media or titles

Always returns a perfect, valid cart

It is the heartbeat of your order accuracy and financial correctness.
