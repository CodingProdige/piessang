export const pushTemplates = {
  "welcome": {
    title: "Welcome to Piessang!",
    body: "Thank you for completing your onboarding.",
    link: "bevgo://home"
  },

  "order-dispatched": {
    title: "Your Order Is On The Way 🚚",
    body: "Order {{orderId}} has been dispatched and is on route.",
    link: "bevgo://order/{{orderId}}"
  },

  "order-received-admin": {
    title: "New Order Received",
    body: "Order {{orderNumber}} has been placed.",
    link: "bevgoclientportal://bevgoclientportal.com/order?orderNumber={{orderNumber}}"
  },

  "order-confirmation": {
    title: "Order Placed Successfully",
    body: "Your order {{orderNumber}} has been placed.",
    link: "bevgoclientportal://bevgoclientportal.com/order?orderNumber={{orderNumber}}"
  },

  "order-delivered": {
    title: "Delivery Complete 🎉",
    body: "Thanks for ordering with Piessang! Your delivery has been completed.",
    link: "bevgo://orders"
  },

  "otp": {
    title: "Your Login Code",
    body: "Your verification code is {{code}}",
    link: "bevgo://login"
  },

  "followed-seller-new-product": {
    title: "New from {{vendorName}}",
    body: "{{productTitle}} is now live on Piessang.",
    link: "{{link}}"
  },

  "seller-new-follower": {
    title: "You gained a new follower",
    body: "{{followerName}} just followed {{vendorName}} on Piessang.",
    link: "{{link}}"
  },

  "favorite-on-sale": {
    title: "A favourite is on sale",
    body: "{{productTitle}} is now on sale.",
    link: "{{link}}"
  },

  "favorite-back-in-stock": {
    title: "Back in stock",
    body: "{{productTitle}} is back in stock.",
    link: "{{link}}"
  },

  "favorite-out-of-stock": {
    title: "Out of stock",
    body: "{{productTitle}} is currently out of stock.",
    link: "{{link}}"
  },

  "seller-billing-reminder": {
    title: "Seller bill due soon",
    body: "{{billingMonthLabel}} billing of {{amountDue}} is due by {{dueDate}}.",
    link: "{{link}}"
  },

  "seller-account-blocked": {
    title: "Seller account blocked",
    body: "Your seller account has been blocked until the outstanding billing amount is settled.",
    link: "{{link}}"
  },

  "seller-billing-settled": {
    title: "Billing settled",
    body: "Your seller bill has been paid and your account access has been restored.",
    link: "{{link}}"
  }
};
