function deprecatedError() {
  return new Error("Easyship shipping integration has been deprecated.");
}

export const easyshipRateAdapter = {
  key: "easyship",
  async getRates() {
    throw deprecatedError();
  },
  async createShipment() {
    throw deprecatedError();
  },
  async getTracking() {
    throw deprecatedError();
  },
};
