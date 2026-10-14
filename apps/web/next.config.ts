import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// The 3 real image hosts present across the full 24,941-row product
// catalog (verified via lib/rag/image-url.ts's extraction logic).
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.soco.id" },
      { protocol: "https", hostname: "s3-ap-southeast-1.amazonaws.com" },
      { protocol: "https", hostname: "soc-uat-uploads.s3.amazonaws.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
