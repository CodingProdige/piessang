export type CourierEstimateErrorCode =
  | "NOT_CONFIGURED"
  | "COURIER_UNAVAILABLE"
  | "ESTIMATE_FAILED"
  | "INVALID_INPUT";

export type CourierEstimateParcel = {
  weightKg: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
};

export type CourierEstimateInput = {
  courierCode: string;
  sellerOrigin: {
    countryCode: string;
    province?: string;
    city?: string;
    postalCode?: string;
  };
  destination: {
    countryCode: string;
    province?: string;
    postalCode?: string;
  };
  parcel: CourierEstimateParcel;
  orderValue?: number;
};

export type CourierEstimateSuccess = {
  ok: true;
  courierCode: string;
  courierName: string;
  estimatedFee: number;
  currency: "ZAR";
  minDays: number | null;
  maxDays: number | null;
  serviceName: string;
  warnings: string[];
};

export type CourierEstimateFailure = {
  ok: false;
  courierCode: string;
  courierName: string;
  errorCode: CourierEstimateErrorCode;
  message: string;
};

export type CourierEstimateResult = CourierEstimateSuccess | CourierEstimateFailure;

export type CourierEstimateCatalogueEntry = {
  courierCode: string;
  courierName: string;
  countryCodes: string[];
  estimateProviderPreference: string[];
  supportsDomestic: boolean;
  supportsInternational: boolean;
  active: boolean;
};

export type CourierEstimateAdapter = (input: CourierEstimateInput & { courierName: string }) => Promise<CourierEstimateResult>;
