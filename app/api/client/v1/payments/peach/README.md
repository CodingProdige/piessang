# Peach Payments API (v1)

This folder contains all Peach payment endpoints used by the app.

## Base path

`/api/v1/payments/peach/*`

## Required environment variables

- `PEACH_S2S_ENTITY_ID`
- `PEACH_S2S_ACCESS_TOKEN`
- `BASE_URL` (used by `charge-card` to build internal redirect URL)
- `PEACH_SHOPPER_RESULT_URL` (optional fallback result URL if request does not provide `shopperResultUrl`)

---

## Endpoints

### `POST /charge-card`
Primary card checkout endpoint (the one your app calls).

What it does:
1. Charges card via Peach (`/v1/payments`).
2. Saves/updates card in `users.paymentMethods.cards`.
3. Resolves order by `merchantTransactionId` in `orders_v2`.
4. Stores redirect/payment mapping in `peach_redirects/{merchantTransactionId}`.
5. Returns success payload including `paymentId` + `shopperResultUrl`.

Important:
- This endpoint does not finalize the order directly.
- Order finalization happens through the unified `orders/payment-success` path
  after Peach payment confirmation.
- It configures Peach `shopperResultUrl` to this API:
  - `/api/v1/payments/peach/shopper-redirect?merchantTransactionId=...`

---

### `GET|POST /shopper-redirect`
Bridge endpoint used when Peach/bank challenge returns the shopper.

What it does:
1. Reads `merchantTransactionId` (query or POST body/form).
2. Loads `peach_redirects/{merchantTransactionId}`.
3. Confirms payment status with Peach.
4. If payment succeeded, calls `/api/client/v1/orders/payment-success`.
5. Builds final redirect URL by appending:
   - `paymentId`
   - `merchantTransactionId`
   - `orderNumber` (if present)
6. Redirects (`302`) to your original `shopperResultUrl`.

Why both methods:
- Some browser/device return flows hit this URL as `GET`, others as `POST`.
- Supporting both prevents `HTTP 405` during 3DS return.

---

### `POST /charge-token`
Charges a previously tokenized/saved card (MIT/CIT token flow).

Typical use:
- Repeat customer payment without full card capture step.

---

### `POST /tokenize`
Saves card token/registration details from Peach for later token charges.

---

### `GET /payment-status`
Fetches payment status from Peach for a payment id/reference.

Use this to verify payment state independently from app state.

---

### `POST /charge-refund`
Issues refund against prior Peach charge/payment id.

Expected behavior:
- Validates amount and request.
- Calls Peach refund API.
- Updates order/payment refund state in your documents.

---

---

## Data collections touched

- `orders_v2` (payment/order status updates)
- `payments_v2` (via shared payment success logic, where applicable)
- `users` (saved cards and payment attempts on card profiles)
- `peach_redirects` (redirect mapping for return flow)

---

## Recommended client flow (charge-card path)

1. App calls `POST /api/v1/payments/peach/charge-card`.
2. Backend processes the charge and stores redirect/payment context.
3. Peach returns shopper to `/api/v1/payments/peach/shopper-redirect`.
4. `shopper-redirect` confirms payment with Peach and calls `/api/client/v1/orders/payment-success`.
5. `shopper-redirect` forwards to your app result URL/deeplink with `paymentId`.
6. App handles final UI/cart cleanup using returned params.

If app UI and backend state disagree, call:
- `GET /api/v1/payments/peach/payment-status`
- then refresh order from `/api/v1/orders/get`.
