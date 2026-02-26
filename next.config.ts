import type { NextConfig } from "next";

const isAndroidExportBuild = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: isAndroidExportBuild ? "export" : "standalone",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
};

export default nextConfig;
