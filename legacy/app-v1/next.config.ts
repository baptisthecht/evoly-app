import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@evoly/ui", "@evoly/core", "@evoly/db", "@evoly/email"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Suppress build output noise when Sentry is not configured
  silent: true,
  // Hide source maps from the client bundle
  sourcemaps: {
    disable: true,
  },
  // Don't auto-instrument Vercel Cron Monitors (we use our own cron setup)
  automaticVercelMonitors: false,
});
