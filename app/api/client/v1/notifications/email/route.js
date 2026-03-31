import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import ejs from "ejs";
import path from "path";
import { emailMessages } from "./messages";
import {
  canSendNotificationToUser,
  resolveNotificationPreferenceRecipient,
  shouldRespectNotificationPreferences,
} from "@/lib/notifications/preferences";

if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const ok = (p={},s=200)=>NextResponse.json({ok:true,...p},{status:s});
const err = (s,t,m,e={})=>NextResponse.json({ok:false,title:t,message:m,...e},{status:s});

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function resolveNotificationName(input = {}) {
  const snapshot = input?.customer_snapshot || {};
  const account = input?.account || snapshot?.account || {};
  const business = input?.business || snapshot?.business || {};
  const personal = input?.personal || snapshot?.personal || {};

  return firstNonEmptyString(
    account?.accountName,
    business?.companyName,
    personal?.fullName,
    input?.customerName,
    input?.companyName,
    input?.name
  );
}

function resolveBaseUrl() {
  return firstNonEmptyString(
    process.env.BASE_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    "https://piessang.com",
  ).replace(/\/+$/, "");
}

export async function POST(req){
  try{
    const body = await req.json();
    const { type, to, data, uid } = body;

    if(!type || !to) return err(400,"Missing Fields","type and to are required");

    const config = emailMessages[type];
    if(!config) return err(400,"Unknown Email Type",`No email config for: ${type}`);

    const resolvedName = resolveNotificationName(data || {});
    const safeData = {
      ...(data || {}),
      ...(resolvedName ? {
        name: resolvedName,
        customerName: resolvedName,
        companyName: resolvedName
      } : {})
    };

    if (shouldRespectNotificationPreferences(type) && !Array.isArray(to)) {
      const recipientUser = await resolveNotificationPreferenceRecipient({
        uid: uid || safeData?.uid || safeData?.userId || safeData?.customerUid,
        email: typeof to === "string" ? to : "",
      });
      if (recipientUser && !canSendNotificationToUser({ channel: "email", type, user: recipientUser })) {
        return ok({
          message: "Email suppressed by notification preferences",
          suppressed: true,
          channel: "email",
          type,
          to,
        });
      }
    }

    const templatePath = path.join(process.cwd(),"app/api/client/v1/notifications/email/templates",config.template);
    const wrapperPath = path.join(process.cwd(),"app/api/client/v1/notifications/email/partials",config.wrapper);

    // Render inner content
    const contentHTML = await ejs.renderFile(templatePath, safeData);

    // Render wrapper with body injected
    const finalHTML = await ejs.renderFile(wrapperPath, {
      body: contentHTML,
      baseUrl: resolveBaseUrl(),
      logoUrl: `${resolveBaseUrl()}/logo/Piessang%20Logo.png`,
    });

    // Render subject
    const subject = ejs.render(config.subjectTemplate, safeData);

    const msg = {
      to,
      from: "no-reply@piessang.com",
      subject,
      html: finalHTML
    };

    console.info("[email]", {
      type,
      to,
      subject,
    });

    const [sendgridResponse] = await sgMail.send(msg);

    return ok({
      message: "Email sent",
      provider: "sendgrid",
      statusCode: sendgridResponse?.statusCode ?? null,
      messageId: sendgridResponse?.headers?.["x-message-id"] || sendgridResponse?.headers?.["X-Message-Id"] || null,
    });
  }catch(e){
    const details = Array.isArray(e?.response?.body?.errors)
      ? e.response.body.errors.map((item) => item?.message || item?.error || String(item)).filter(Boolean)
      : [];
    return err(500,"Email Error",e.message, {
      provider: "sendgrid",
      details: details.length ? details : undefined,
    });
  }
}
