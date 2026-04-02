// ---------------------------------------------------------------------------
// SMS TEMPLATE REGISTRY
// These templates are backend-controlled so the Flutter app never needs updates.
// Each template can support interpolation via {{variable}}.
// ---------------------------------------------------------------------------

export const smsTemplates = {
    "followed-seller-new-product": {
      message: "{{vendorName}} just released {{productTitle}} on Piessang."
    },

    "favorite-on-sale": {
      message: "{{productTitle}} is now on sale on Piessang."
    },

    "favorite-back-in-stock": {
      message: "{{productTitle}} is back in stock on Piessang."
    },

    "favorite-out-of-stock": {
      message: "{{productTitle}} is currently out of stock on Piessang."
    },

    "order-seller-fulfillment-update": {
      message: "Update for order {{orderNumber}}: {{statusMessage}}"
    },

    "seller-new-order": {
      message: "New marketplace order {{orderNumber}} includes your products. Please review it in your seller dashboard."
    },

    "order-dispatched": {
      message: "Your Piessang order has just been dispatched! 🚚💨 Delivery is on the way."
    },
  
    "order-delivered": {
      message: "Your delivery has been completed! Thank you for choosing Piessang. 🍻"
    },
  
    "welcome": {
      message: "Welcome to Piessang! Your account setup is complete — happy ordering! 🎉"
    },
  
    "otp": {
      message: "Your one-time login code is: {{code}}"
    },
  
    "account-pending-activation": {
      message: "Your Piessang account is created and pending activation. We'll notify you once it's ready."
    },
  
    "invoice-overdue": {
      message: "Reminder: Your invoice {{invoiceNumber}} is overdue."
    },
  
    "payment-received": {
      message: "Payment received — thank you! Receipt for {{amount}} has been allocated."
    }
  };
  
