export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function fallbackReply(input, vendorName = "your seller account") {
  const query = toStr(input).toLowerCase();
  if (!query) return "Ask me about setup, delivery rules, products, payouts, orders, returns, or how Piessang works and I’ll help in plain seller language.";
  if (query.includes("payout") || query.includes("stripe") || query.includes("bank")) return "Piessang pays sellers out through Stripe payout setup in seller settings. Connect your payout profile first, then settlements move from gross sales to fees, refund adjustments, and finally net due.";
  if (query.includes("delivery") || query.includes("shipping") || query.includes("courier") || query.includes("pickup")) return "Your delivery rules decide whether orders go out by direct delivery, shipping, or collection. Set those up in seller settings so Piessang can calculate the right delivery method and lead time automatically.";
  if (query.includes("publish") || query.includes("product") || query.includes("catalogue")) return `A product for ${vendorName} is ready to publish once its details, variants, fulfilment setup, pricing, and stock are complete. Start in Products, finish the missing pieces, then publish it once moderation and availability are in a good state.`;
  if (query.includes("return") || query.includes("refund") || query.includes("credit")) return "Customers log returns from their order page. Once a return is approved and refunded, the original invoice stays intact and Piessang issues a separate credit note for the adjustment.";
  if (query.includes("order") || query.includes("fulfil")) return "New seller orders land in Orders. Move them forward in sequence, capture courier details when shipping is involved, and keep statuses moving forward only so the customer and your own timeline stay accurate.";
  return "I can help with seller setup, product publishing, delivery rules, payouts, orders, returns, settlements, notifications, and general Piessang workflow questions.";
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = toStr(body?.prompt);
    const vendorName = toStr(body?.vendorName || "your seller account");
    const sellerSlug = toStr(body?.sellerSlug);
    const sellerCode = toStr(body?.sellerCode);
    if (!prompt) return err(400, "Missing Prompt", "Ask a question first.");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return ok({ reply: fallbackReply(prompt, vendorName) });

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are Piessang's seller dashboard assistant. Answer freeform seller questions in concise, plain English. " +
            "Stay specific to running a seller account on Piessang: products, publishing, delivery rules, payouts, orders, returns, settlements, notifications, followers, warehouses, invoices, and credit notes. " +
            "Do not act like you only support preset FAQs. If unsure, give the most likely workflow and tell the seller where in the dashboard to go next. Keep answers under 140 words.",
        },
        {
          role: "user",
          content:
            `Seller name: ${vendorName}\nSeller slug: ${sellerSlug || "unknown"}\nSeller code: ${sellerCode || "unknown"}\n\nQuestion: ${prompt}`,
        },
      ],
    });

    const reply = toStr(completion?.choices?.[0]?.message?.content) || fallbackReply(prompt, vendorName);
    return ok({ reply });
  } catch {
    return ok({ reply: fallbackReply("", "your seller account") });
  }
}
