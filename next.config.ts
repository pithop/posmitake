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

  // COOP header for SharedArrayBuffer (PowerSync WASM)
  // NOTE: COEP removed — it blocks cross-origin Supabase Realtime WebSocket
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },

  turbopack: {},
};

export default nextConfig;
