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
  }
};
