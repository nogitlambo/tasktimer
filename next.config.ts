import type { NextConfig } from "next";

const isAndroidExportBuild = process.env.NEXT_ANDROID_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isAndroidExportBuild ? "export" : "standalone",
  trailingSlash: true,
  async headers() {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.googletagmanager.com https://www.google.com https://apis.google.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseappcheck.googleapis.com https://www.googleapis.com https://api.stripe.com https://*.atlassian.net",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://*.firebaseapp.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
  // Keep an explicit Turbopack section so Next.js 16 does not reject this config
  // when dev/default commands run with Turbopack enabled.
  turbopack: {},
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Genkit pulls in OpenTelemetry's optional Jaeger exporter path via sdk-node.
      // We do not use Jaeger in this app, so mark it unavailable to avoid build-time
      // resolution warnings from webpack/Next server bundling.
      "@opentelemetry/exporter-jaeger": false,
    };
    return config;
  },
};

export default nextConfig;
