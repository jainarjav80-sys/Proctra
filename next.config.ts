import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: almost every page reads the session or interview state per request,
  // and the Suspense-everywhere rules cost more time than they save in a 10h prototype.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
