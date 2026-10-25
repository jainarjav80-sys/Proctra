import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs (inside pdf-parse) loads its worker file at runtime, so it must not be bundled.
  serverExternalPackages: ["pdf-parse"],
  // Cross-origin isolation on candidate pages enables multi-threaded WASM (SharedArrayBuffer) for
  // in-browser TTS/vision. "credentialless" keeps CDN/model downloads working without CORP headers.
  async headers() {
    const isolation = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ];
    return [
      { source: "/interview/:path*", headers: isolation },
      { source: "/m/:path*", headers: isolation },
      { source: "/dev/:path*", headers: isolation },
    ];
  },
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
