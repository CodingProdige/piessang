import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-body";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildOrderDeliveryProgress } from "@/lib/orders/fulfillment-progress";
import { isGuestOrderAccessAllowed, verifyGuestOrderAccessToken } from "@/lib/orders/guest-access";
import { normalizeMoneyAmount } from "@/lib/money";
import { GuestOrderAccountPrompt } from "@/components/cart/guest-order-account-prompt";

export const metadata: Metadata = {
  title: "Track Guest Order",
  description: "Track your Piessang guest order.",
  robots: {
    index: false,
    follow: false,
  },
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: unknown) {
  const amount = normalizeMoneyAmount(Number(value || 0));
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: unknown) {
  const date = new Date(toStr(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function GuestOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parsed = verifyGuestOrderAccessToken(token);
  if (!parsed?.orderId) notFound();

  const db = getAdminDb();
  if (!db) notFound();
  const snap = await db.collection("orders_v2").doc(parsed.orderId).get();
  if (!snap.exists) notFound();

  const order: any = { docId: snap.id, ...(snap.data() || {}) };
  if (!isGuestOrderAccessAllowed({ order, token })) notFound();

  const { items, progress } = buildOrderDeliveryProgress(order);
  const orderNumber = toStr(order?.order?.orderNumber || order?.docId || "Order");
  const orderStatus = toStr(order?.lifecycle?.orderStatus || order?.order?.status?.order || "processing");
  const paymentStatus = toStr(order?.lifecycle?.paymentStatus || order?.payment?.status || "paid");
  const customerEmail = toStr(
    order?.customer?.email ||
      order?.customer_snapshot?.email ||
      order?.customer_snapshot?.account?.email ||
      order?.customer_snapshot?.personal?.email,
  );

  return (
    <PageBody className="px-4 py-10">
      <section className="overflow-hidden rounded-[18px] border border-black/5 bg-white shadow-[0_18px_44px_rgba(20,24,27,0.08)]">
        <div className="border-b border-black/5 bg-[linear-gradient(135deg,#fff8d6_0%,#ffffff_45%,#fff4b3_100%)] px-6 py-8 sm:px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#907d4c]">Guest order tracking</p>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight text-[#202020] sm:text-[42px]">
            {orderNumber}
          </h1>
          <p className="mt-3 max-w-[620px] text-[15px] leading-7 text-[#57636c]">
            Track this order without an account. If you create an account later with <span className="font-semibold text-[#202020]">{customerEmail || "the same email"}</span>, we’ll surface this order in your account too.
          </p>
        </div>

        <div className="space-y-6 px-6 py-8 sm:px-10">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[14px] border border-black/5 bg-[#faf8f1] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Order status</p>
              <p className="mt-3 text-[20px] font-semibold text-[#202020]">{orderStatus || "Processing"}</p>
              <p className="mt-2 text-[13px] text-[#57636c]">Placed {formatDate(order?.timestamps?.createdAt)}</p>
            </div>
            <div className="rounded-[14px] border border-black/5 bg-[#faf8f1] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Payment</p>
              <p className="mt-3 text-[20px] font-semibold text-[#202020]">{paymentStatus || "Paid"}</p>
              <p className="mt-2 text-[13px] text-[#57636c]">Amount {formatMoney(order?.payment?.required_amount_incl || order?.totals?.final_payable_incl || 0)}</p>
            </div>
            <div className="rounded-[14px] border border-black/5 bg-[#faf8f1] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Delivery progress</p>
              <p className="mt-3 text-[20px] font-semibold text-[#202020]">{Math.round(Number(progress?.percentageDelivered || 0))}%</p>
              <p className="mt-2 text-[13px] text-[#57636c]">{Number(progress?.deliveredItems || 0)} of {Number(progress?.totalItems || 0)} items delivered</p>
            </div>
          </div>

          <div className="rounded-[14px] border border-black/5 bg-white">
            <div className="border-b border-black/5 px-5 py-4">
              <h2 className="text-[20px] font-semibold text-[#202020]">Items in this order</h2>
            </div>
            <div className="space-y-3 px-5 py-5">
              {(Array.isArray(items) ? items : []).map((item: any, index: number) => (
                <div key={`${toStr(item?.product_snapshot?.product?.title || item?.title || "item")}-${index}`} className="rounded-[10px] border border-black/5 bg-[#fafafa] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#202020]">
                        {toStr(item?.product_snapshot?.product?.title || item?.title || "Product")}
                      </p>
                      <p className="mt-1 text-[13px] text-[#57636c]">
                        {toStr(item?.selected_variant_snapshot?.label || item?.variantLabel || "Selected variant")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] text-[#57636c]">Qty {Math.max(0, Number(item?.quantity || 0))}</p>
                      <p className="mt-1 text-[15px] font-semibold text-[#202020]">{formatMoney(item?.line_totals?.final_incl || 0)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <GuestOrderAccountPrompt />
            <Link
              href="/products"
              className="inline-flex h-12 items-center justify-center rounded-[10px] border border-black/10 bg-white px-5 text-[14px] font-semibold text-[#202020]"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </section>
    </PageBody>
  );
}
