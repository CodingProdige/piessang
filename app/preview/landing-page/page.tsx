import type { Metadata } from "next";
import { LandingPageIframePreview } from "@/components/cms/landing-page-iframe-preview";

export const metadata: Metadata = {
  title: "Landing Page Preview",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LandingPreviewPage() {
  return <LandingPageIframePreview />;
}
