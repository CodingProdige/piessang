====================================================================
              PIESSANG PUSH NOTIFICATION SYSTEM (FCM v1)
====================================================================

This folder contains the backend logic for sending Firebase Cloud 
Messaging (FCM) push notifications using the modern OAuth2 HTTP v1 API.

This system allows the Piessang backend to trigger push notifications 
from anywhere — FlutterFlow, Postman, admin dashboards, CRON jobs, 
credit approval endpoints, Slack bots, etc.

Directory structure:

  /api/v1/notifications/push/
  ├── route.js                 → Main push notification endpoint
  ├── messages.js              → All notification templates
  ├── serviceAccountKey.js     → Firebase Admin SDK private key
  └── readme.txt               → Documentation (this file)


====================================================================
1) HOW THIS SYSTEM WORKS
====================================================================

Firebase Cloud Messaging (FCM) offers two ways to send notifications:

  • Legacy Server Key ("AAAAxxxxxxxx")
          → deprecated, insecure, WILL STOP WORKING SOON.

  • HTTP v1 API (OAuth2 token, service account)
          → modern, secure, recommended.

THIS IMPLEMENTATION USES HTTP v1.

We generate an OAuth2 access token using the Firebase Admin SDK 
credentials inside serviceAccountKey.js. This token authorizes our 
Vercel server to send push notifications to any user device.


====================================================================
2) DEVICE TOKEN REQUIREMENT
====================================================================

To receive notifications, a user must have at least one device token 
stored in their user document:

  users/{uid}/system/deviceTokens: [ "<token1>", "<token2>" ]

FlutterFlow automatically writes this value when push notifications are 
enabled in the app.

If the token array is empty, the endpoint returns:

  { ok:false, message:"User has no registered device tokens" }


====================================================================
3) message.js — TEMPLATE-BASED NOTIFICATION SYSTEM
====================================================================

All push notifications are defined in:

  messages.js

Each template includes:
  • title
  • body
  • optional {{variables}} for dynamic substitution

Example entry:

  "order-dispatched": {
    title: "Your Order Is On The Way 🚚",
    body: "Order {{orderId}} has been dispatched and is on route."
  }

The backend replaces variables with values you send in the request.


====================================================================
4) ENDPOINT: SEND A PUSH NOTIFICATION
====================================================================

URL:
  POST /api/v1/notifications/push/send

Required JSON body:
  {
    "uid": "USER_ID_HERE",
    "type": "TEMPLATE_KEY",
    "variables": { ...optional dynamic fields... }
  }


====================================================================
5) EXAMPLES (POSTMAN / BACKEND)
====================================================================

Example: Credit approved
  {
    "uid": "123ABC",
    "type": "credit-approved"
  }

Example: OTP with dynamic variable
  {
    "uid": "123ABC",
    "type": "otp",
    "variables": {
      "code": "732992"
    }
  }

Example: Order dispatch
  {
    "uid": "123ABC",
    "type": "order-dispatched",
    "variables": {
      "orderId": "BG-4098"
    }
  }


====================================================================
6) RESPONSE FORMAT
====================================================================

On success:
  {
    "ok": true,
    "sentAt": "2025-11-25T10:21:00.000Z",
    "message": {
      "title": "...",
      "body": "..."
    },
    "tokenCount": 2,
    "responses": [ ...FCM raw responses... ]
  }

On failure:
  {
    "ok": false,
    "title": "Error Title",
    "message": "Detailed error message"
  }


====================================================================
7) SECURITY NOTES
====================================================================

• serviceAccountKey.js MUST NOT be committed to GitHub.
• Vercel automatically bundles files inside /api so keep secrets here.
• Do not expose tokens or service account credentials to the client.
• This endpoint should only be called from:
      - FlutterFlow authenticated requests
      - Admin backend tools
      - Postman during development


====================================================================
8) WHEN TO USE THIS MODULE
====================================================================

Use this push notification endpoint for:

  - Order updates (dispatched / delivered)
  - Credit approval notifications
  - New promotions
  - OTP codes
  - System alerts
  - Driver arrival notifications
  - Anything requiring real-time delivery

SMS is reserved for:
  - OTP fallback
  - Payment failures
  - Delivery issues
  - Urgent communication

Email is reserved for:
  - Statements
  - Invoices
  - Account updates


====================================================================
9) EXTENDING THIS MODULE
====================================================================

You can add:

  • New push templates (messages.js)
  • Scheduled push notifications
  • Batch / group pushes
  • Topic-based messaging (e.g., “all business customers”)
  • Combined SMS + Email + Push triggers

If you want a combined "notifyUser" endpoint, ask:
  → “Create a unified notification module”


====================================================================
END OF DOCUMENTATION
====================================================================
