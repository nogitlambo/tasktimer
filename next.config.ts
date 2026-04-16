import type { NextConfig } from "next";

const isAndroidExportBuild = process.env.NEXT_ANDROID_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isAndroidExportBuild ? "export" : "standalone",
  trailingSlash: true,
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
