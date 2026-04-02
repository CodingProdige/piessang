import { createCustomerNotification } from "@/lib/notifications/customer-inbox";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function dispatchCustomerNotification({
  origin = "",
  userId = "",
  email = "",
  phone = "",
  type = "",
  title = "",
  message = "",
  href = "",
  metadata = {},
  dedupeKey = "",
  emailType = "",
  emailData = {},
  smsType = "",
  smsData = {},
  pushType = "",
  pushVariables = {},
}) {
  const result = await createCustomerNotification({
    userId,
    type,
    title,
    message,
    href,
    metadata,
    dedupeKey,
  });

  if (!result?.created) return result;
  const baseOrigin = toStr(origin);
  if (!baseOrigin) return result;

  if (emailType && email) {
    await fetch(`${baseOrigin}/api/client/v1/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: emailType,
        to: email,
        uid: userId,
        data: emailData,
      }),
    }).catch(() => null);
  }

  if (smsType && phone) {
    await fetch(`${baseOrigin}/api/client/v1/notifications/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: smsType,
        to: phone,
        uid: userId,
        data: smsData,
      }),
    }).catch(() => null);
  }

  if (pushType && userId) {
    await fetch(`${baseOrigin}/api/client/v1/notifications/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: userId,
        type: pushType,
        variables: pushVariables,
        data: {
          link: href,
        },
      }),
    }).catch(() => null);
  }

  return result;
}
