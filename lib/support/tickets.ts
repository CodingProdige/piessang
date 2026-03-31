import { getAdminDb } from "@/lib/firebase/admin";

export const ACTIVE_SUPPORT_TICKET_STATUSES = ["open", "waiting_on_support", "waiting_on_customer"] as const;

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function slugifySupportCategory(value: unknown) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "general";
}

export function getSupportTicketStatusLabel(status: unknown) {
  const value = toStr(status).toLowerCase();
  if (value === "waiting_on_support") return "Waiting on support";
  if (value === "waiting_on_customer") return "Waiting on you";
  if (value === "closed") return "Closed";
  return "Open";
}

export function sanitizeSupportMessage(value: unknown) {
  return toStr(value).replace(/\s+/g, " ").trim();
}

export function buildSupportTicketDoc(params: {
  ticketId: string;
  uid: string;
  email: string;
  customerName: string;
  subject: string;
  category: string;
  message: string;
  createdAt?: string;
}) {
  const createdAt = toStr(params.createdAt) || new Date().toISOString();
  const category = slugifySupportCategory(params.category);
  return {
    ticket: {
      ticketId: params.ticketId,
      subject: toStr(params.subject),
      category,
      status: "open",
      active: true,
      createdAt,
      updatedAt: createdAt,
      closedAt: "",
      lastReplyAt: createdAt,
      lastReplyBy: "customer",
      messagePreview: sanitizeSupportMessage(params.message).slice(0, 180),
      unreadForCustomer: false,
      unreadForSupport: true,
    },
    customer: {
      uid: toStr(params.uid),
      email: toStr(params.email),
      name: toStr(params.customerName) || "Customer",
    },
    metrics: {
      messageCount: 1,
    },
  };
}

export function buildSupportTicketMessageDoc(params: {
  messageId: string;
  authorType: "customer" | "support" | "admin" | "system";
  authorUid?: string;
  authorName?: string;
  body: string;
  createdAt?: string;
}) {
  const createdAt = toStr(params.createdAt) || new Date().toISOString();
  return {
    messageId: params.messageId,
    authorType: params.authorType,
    authorUid: toStr(params.authorUid),
    authorName: toStr(params.authorName) || (params.authorType === "customer" ? "Customer" : "Piessang support"),
    body: sanitizeSupportMessage(params.body),
    createdAt,
  };
}

export async function getCustomerSupportTickets(uid: string) {
  const db = getAdminDb();
  if (!db || !toStr(uid)) return [];
  const snap = await db.collection("support_tickets_v1").where("customer.uid", "==", toStr(uid)).get();
  return snap.docs
    .map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }))
    .sort((a: any, b: any) => {
      const left = Date.parse(toStr(a?.ticket?.updatedAt || a?.ticket?.createdAt));
      const right = Date.parse(toStr(b?.ticket?.updatedAt || b?.ticket?.createdAt));
      return right - left;
    });
}

export async function getActiveSupportTicket(uid: string) {
  const rows = await getCustomerSupportTickets(uid);
  return rows.find((row: any) => ACTIVE_SUPPORT_TICKET_STATUSES.includes(toStr(row?.ticket?.status).toLowerCase() as any)) || null;
}

export async function getSupportTicketMessages(ticketId: string) {
  const db = getAdminDb();
  if (!db || !toStr(ticketId)) return [];
  const snap = await db
    .collection("support_tickets_v1")
    .doc(toStr(ticketId))
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }));
}

export async function isSystemAdminUid(uid: string) {
  const db = getAdminDb();
  if (!db || !toStr(uid)) return false;
  const snap = await db.collection("users").doc(toStr(uid)).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  return toStr((data as any)?.system?.accessType || (data as any)?.systemAccessType).toLowerCase() === "admin";
}

export function buildSupportStatusUpdateCopy(status: string) {
  const value = toStr(status).toLowerCase();
  if (value === "waiting_on_customer") {
    return {
      title: "Support replied to your ticket",
      summary: "Piessang has replied and may need more information from you.",
    };
  }
  if (value === "closed") {
    return {
      title: "Your support ticket has been closed",
      summary: "If you still need help, you can start a new ticket once this one is closed.",
    };
  }
  return {
    title: "Your support ticket was updated",
    summary: "There is a new update on your support ticket.",
  };
}
