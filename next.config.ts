import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow cross-origin requests from specific development origins
  allowedDevOrigins: ['192.168.0.114'],
  // Simple webpack config to prevent system directory scanning
  webpack: (config, { dev }) => {
    if (!dev) {
      // Disable watching during production build
      config.watchOptions = {
        ignored: '**/*',
      };
    }
    return config;
  },
  // Additional build optimizations
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  async headers() {
    return [
      {
        source: "/upload/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  // Disable file system access during build
  serverExternalPackages: ['fs', 'path', 'os'],
};

export default nextConfig;
