import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.sushi-aixsud.com',
      },
    ],
  },

  // Required for PowerSync WASM workers (OPFS requires Cross-Origin Isolation)
  // SharedArrayBuffer requires COOP + COEP headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },

  // Silence the Turbopack/webpack mismatch error — we don't need custom webpack
  // PowerSync workers are served from /public via the @powersync/web package
  turbopack: {},
};

export default nextConfig;
