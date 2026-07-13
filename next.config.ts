import type { NextConfig } from "next";
import path from "path";

function getConnectSrcOrigins(): string {
  const defaults = new Set([
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "http://localhost:4000",
  ]);

  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    try {
      const origin = new URL(fromEnv).origin;
      defaults.add(origin);
    } catch {
      // ignore malformed env value and keep defaults
    }
  }

  return Array.from(defaults).join(" ");
}

const nextConfig: NextConfig = {
  // 루트 goldsilver 모노레포에 pnpm-lock.yaml이 있어 Turbopack이 워크스페이스 루트를
  // 잘못 추론하는 경고가 뜨는 것을 방지 — biz-web 자체를 루트로 고정.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next App Router 하이드레이션 인라인 스크립트가 nonce 인프라 없이는
              // 동작하지 않아 unsafe-inline 유지(admin-web과 동일 트레이드오프).
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev https://*.supabase.co",
              `connect-src ${getConnectSrcOrigins()}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
