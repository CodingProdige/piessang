// ---------------------------------------------------------------------------
// SMS TEMPLATE REGISTRY
// These templates are backend-controlled so the Flutter app never needs updates.
// Each template can support interpolation via {{variable}}.
// ---------------------------------------------------------------------------

export const smsTemplates = {
    "order-seller-fulfillment-update": {
      message: "Update for order {{orderNumber}}: {{vendorName}} marked your items as {{statusLabel}}."
    },

    "seller-new-order": {
      message: "New marketplace order {{orderNumber}} includes your products. Please review it in your seller dashboard."
    },

    "order-dispatched": {
      message: "Your Bevgo order has just been dispatched! 🚚💨 Delivery is on the way."
    },
  
    "order-delivered": {
      message: "Your delivery has been completed! Thank you for choosing Bevgo. 🍻"
    },
  
    "welcome": {
      message: "Welcome to Bevgo! Your account setup is complete — happy ordering! 🎉"
    },
  
    "otp": {
      message: "Your one-time login code is: {{code}}"
    },
  
    "account-pending-activation": {
      message: "Your Bevgo account is created and pending activation. We'll notify you once it's ready."
    },
  
    "invoice-overdue": {
      message: "Reminder: Your invoice {{invoiceNumber}} is overdue."
    },
  
    "payment-received": {
      message: "Payment received — thank you! Receipt for {{amount}} has been allocated."
    }
  };
  
