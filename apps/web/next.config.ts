import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// The 3 real image hosts present across the full 24,941-row product
// catalog (verified via lib/rag/image-url.ts's extraction logic).
const nextConfig: NextConfig = {
  // Emits a lean .next/standalone server bundle (just the traced files
  // it needs, not the full node_modules) — used by apps/web/Dockerfile's
  // runtime stage. Does not change `next dev`/`next start` behavior.
  output: "standalone",
  // Next's output file tracing (@vercel/nft) misses `ioredis` and its
  // transitive deps entirely for this project — verified in the built
  // standalone image: `pg` gets traced in correctly, `ioredis` does not,
  // which would crash any session-check request with MODULE_NOT_FOUND in
  // the Docker image. Force-including it (full dependency closure, read
  // from package-lock.json) is the documented fix for tracer gaps like
  // this — ioredis itself was present after the first attempt, but its
  // own deps (@ioredis/commands, ms, etc.) still weren't, so the glob
  // needs each of them listed, not just ioredis's own folder.
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/ioredis/**/*",
      "node_modules/@ioredis/**/*",
      "node_modules/cluster-key-slot/**/*",
      "node_modules/debug/**/*",
      "node_modules/denque/**/*",
      "node_modules/ms/**/*",
      "node_modules/redis-errors/**/*",
      "node_modules/standard-as-callback/**/*",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.soco.id" },
      { protocol: "https", hostname: "s3-ap-southeast-1.amazonaws.com" },
      { protocol: "https", hostname: "soc-uat-uploads.s3.amazonaws.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
