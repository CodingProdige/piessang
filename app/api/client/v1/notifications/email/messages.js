export const emailMessages = {
    "welcome": {
      wrapper: "marketing-wrapper.ejs",
      template: "welcome.ejs",
      subjectTemplate: "Welcome to Piessang, <%= firstName %>!"
    },

    "account-pending": {
        wrapper: "corporate-wrapper.ejs",
        template: "account-pending.ejs",
        subjectTemplate: "Welcome, <%= companyName %>. Your Piessang Account is Pending Activation"
    },

  
    "credit-approved": {
      wrapper: "corporate-wrapper.ejs",
      template: "credit-approved.ejs",
      subjectTemplate: "Your Piessang Credit is Approved — Ref <%= code %>"
    },
  
    "credit-rejected": {
      wrapper: "corporate-wrapper.ejs",
      template: "credit-rejected.ejs",
      subjectTemplate: "Your Credit Application Result — Ref <%= code %>"
    },

    "credit-application-submitted": {
      wrapper: "corporate-wrapper.ejs",
      template: "credit-application-submitted.ejs",
      subjectTemplate: "Your Piessang Credit Application Has Been Received"
    },

    "credit-application-submitted-admin": {
      wrapper: "corporate-wrapper.ejs",
      template: "credit-application-submitted-admin.ejs",
      subjectTemplate: "New Credit Application — <%= companyName %>"
    },

    "seller-registration-success": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-registration-success.ejs",
      subjectTemplate: "Welcome to Piessang Marketplace, <%= vendorName %>!"
    },

    "seller-registration-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-registration-internal.ejs",
      subjectTemplate: "New Seller Registration — <%= vendorName %>"
    },

    "seller-account-blocked": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-account-blocked.ejs",
      subjectTemplate: "Your Piessang seller account has been blocked — <%= vendorName %>"
    },

    "seller-account-blocked-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-account-blocked-internal.ejs",
      subjectTemplate: "Seller account blocked — <%= vendorName %>"
    },

    "seller-review-request-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-review-request-internal.ejs",
      subjectTemplate: "Seller review request — <%= vendorName %>"
    },

    "seller-review-response": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-review-response.ejs",
      subjectTemplate: "Seller review result — <%= vendorName %> (<%= statusLabel %>)"
    },

    "seller-team-invite": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-team-invite.ejs",
      subjectTemplate: "You have been invited to join <%= vendorName %> on Piessang"
    },

    "seller-team-access-granted": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-team-access-granted.ejs",
      subjectTemplate: "Access granted to <%= vendorName %> on Piessang"
    },

    "seller-product-status": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-product-status.ejs",
      subjectTemplate: "Product update for <%= productTitle %> — <%= statusLabel %>"
    },

    "seller-low-stock": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-low-stock.ejs",
      subjectTemplate: "Low stock alert — <%= productTitle %>"
    },

    "seller-billing-reminder": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-billing-reminder.ejs",
      subjectTemplate: "Seller billing reminder — <%= vendorName %> — due <%= dueDate %>"
    },

    "seller-delivery-settings-reminder": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-delivery-settings-reminder.ejs",
      subjectTemplate: "Action needed: <%= hiddenCount %> product<%= hiddenCount === 1 ? '' : 's' %> hidden on Piessang"
    },

    "seller-inbound-booking-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-inbound-booking-internal.ejs",
      subjectTemplate: "Inbound stock booking — <%= vendorName %> — <%= productTitle %> on <%= deliveryDate %>"
    },

    "seller-stock-upliftment-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-stock-upliftment-internal.ejs",
      subjectTemplate: "Stock upliftment request — <%= vendorName %> — <%= productTitle %> on <%= upliftDate %>"
    },

    "seller-warehouse-event-reminder": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-warehouse-event-reminder.ejs",
      subjectTemplate: "<%= reminderTimingLabel %>: <%= eventKindLabel %> — <%= productTitle %> on <%= scheduleDate %>"
    },

    "seller-order-received": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-order-received.ejs",
      subjectTemplate: "New marketplace order — <%= orderNumber %> — <%= vendorName %>"
    },

    "brand-request-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "brand-request-internal.ejs",
      subjectTemplate: "Brand request — <%= brandTitle %> — <%= vendorName %>"
    },

    "product-report-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "product-report-internal.ejs",
      subjectTemplate: "Product report — <%= productTitle %> — <%= reasonLabel %>"
    },

    "product-report-dispute-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "product-report-dispute-internal.ejs",
      subjectTemplate: "Product report dispute — <%= productTitle %> — <%= vendorName %>"
    },
  
    "order-confirmation": {
      wrapper: "corporate-wrapper.ejs",
      template: "order-confirmation.ejs",
      subjectTemplate: "Order <%= orderNumber %> Confirmed"
    },

    "order-processing": {
      wrapper: "corporate-wrapper.ejs",
      template: "order-processing.ejs",
      subjectTemplate: "Order <%= orderNumber || 'your order' %> is Processing"
    },

    "order-dispatched": {
      wrapper: "corporate-wrapper.ejs",
      template: "order-dispatched.ejs",
      subjectTemplate: "Order <%= orderNumber || 'your order' %> Dispatched"
    },

    "order-seller-fulfillment-update": {
      wrapper: "corporate-wrapper.ejs",
      template: "order-seller-fulfillment-update.ejs",
      subjectTemplate: "Order <%= orderNumber || 'your order' %> update — <%= statusLabel %>"
    },

    "seller-rating-request": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-rating-request.ejs",
      subjectTemplate: "How was <%= vendorName %> on order <%= orderNumber || 'your order' %>?"
    },

    "order-review-request": {
      wrapper: "corporate-wrapper.ejs",
      template: "order-review-request.ejs",
      subjectTemplate: "Your order <%= orderNumber || 'with Piessang' %> is complete — leave a review"
    },

    "return-request-submitted": {
      wrapper: "corporate-wrapper.ejs",
      template: "return-request-submitted.ejs",
      subjectTemplate: "We received your return request for order <%= orderNumber %>"
    },

    "seller-return-request": {
      wrapper: "corporate-wrapper.ejs",
      template: "seller-return-request.ejs",
      subjectTemplate: "Return request for <%= vendorName %> — order <%= orderNumber %>"
    },

    "return-request-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "return-request-internal.ejs",
      subjectTemplate: "Return request received — order <%= orderNumber %> — <%= ownerLabel %>"
    },

    "return-status-update": {
      wrapper: "corporate-wrapper.ejs",
      template: "return-status-update.ejs",
      subjectTemplate: "Return update for order <%= orderNumber %> — <%= statusLabel %>"
    },

    "support-ticket-created": {
      wrapper: "corporate-wrapper.ejs",
      template: "support-ticket-created.ejs",
      subjectTemplate: "We received your support ticket — <%= subject %>"
    },

    "support-ticket-created-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "support-ticket-created-internal.ejs",
      subjectTemplate: "New support ticket — <%= subject %> — <%= customerName %>"
    },

    "support-ticket-updated": {
      wrapper: "corporate-wrapper.ejs",
      template: "support-ticket-updated.ejs",
      subjectTemplate: "Support ticket update — <%= subject %>"
    },

    "support-ticket-closing-warning": {
      wrapper: "corporate-wrapper.ejs",
      template: "support-ticket-closing-warning.ejs",
      subjectTemplate: "Action needed: your support ticket will close soon — <%= subject %>"
    },

    "support-ticket-customer-reply-internal": {
      wrapper: "corporate-wrapper.ejs",
      template: "support-ticket-customer-reply-internal.ejs",
      subjectTemplate: "Customer replied to support ticket — <%= subject %>"
    },

    "cart-item-sale": {
      wrapper: "corporate-wrapper.ejs",
      template: "cart-item-sale.ejs",
      subjectTemplate: "Good news: an item in your cart is now on sale"
    },

    "followed-seller-new-product": {
      wrapper: "corporate-wrapper.ejs",
      template: "followed-seller-new-product.ejs",
      subjectTemplate: "New from <%= vendorName %> — <%= productTitle %>"
    },

    "favorite-on-sale": {
      wrapper: "corporate-wrapper.ejs",
      template: "favorite-on-sale.ejs",
      subjectTemplate: "A favourite is now on sale — <%= productTitle %>"
    },

    "favorite-back-in-stock": {
      wrapper: "corporate-wrapper.ejs",
      template: "favorite-back-in-stock.ejs",
      subjectTemplate: "Back in stock — <%= productTitle %>"
    },

    "favorite-out-of-stock": {
      wrapper: "corporate-wrapper.ejs",
      template: "favorite-out-of-stock.ejs",
      subjectTemplate: "Out of stock — <%= productTitle %>"
    },

    "payment-received": {
      wrapper: "corporate-wrapper.ejs",
      template: "payment-received.ejs",
      subjectTemplate:
        "Payment received for <%= orderNumber || 'your order' %>"
    },

    "order-received-admin": {
      wrapper: "corporate-wrapper.ejs",
      template: "order-received-admin.ejs",
      subjectTemplate:
        "New order received: <%= orderNumber || merchantTransactionId || 'unknown reference' %>"
    },
  
    "overdue-invoice": {
      wrapper: "corporate-wrapper.ejs",
      template: "overdue-invoice.ejs",
      subjectTemplate: "Invoice <%= invoiceNumber %> is Overdue — <%= daysLate %> Days Late"
    }
  };
  
