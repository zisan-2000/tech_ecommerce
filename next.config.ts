import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
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
  async redirects() {
    return [
      {
        source: "/ecommerce",
        destination: "/",
        permanent: true,
      },
      {
        source: "/ecommerce/authors/:path*",
        destination: "/ecommerce/brands",
        permanent: true,
      },
      {
        source: "/ecommerce/publishers/:path*",
        destination: "/ecommerce/brands",
        permanent: true,
      },
      {
        source: "/ecommerce/books",
        destination: "/ecommerce/products",
        permanent: true,
      },
      {
        source: "/ecommerce/books/:identifier",
        destination: "/ecommerce/products/:identifier",
        permanent: true,
      },
      {
        source: "/ecommerce/book-fair",
        destination: "/ecommerce/flash-sale",
        permanent: true,
      },
      {
        source: "/ecommerce/track-order",
        destination: "/ecommerce/user/orders",
        permanent: true,
      },
      {
        source: "/books",
        destination: "/ecommerce/products",
        permanent: true,
      },
      {
        source: "/books/:identifier",
        destination: "/ecommerce/books/:identifier",
        permanent: true,
      },
      {
        source: "/authors/:path*",
        destination: "/ecommerce/brands",
        permanent: true,
      },
      {
        source: "/publishers/:path*",
        destination: "/ecommerce/brands",
        permanent: true,
      },
      {
        source: "/about",
        destination: "/ecommerce/about",
        permanent: true,
      },
      {
        source: "/contact",
        destination: "/ecommerce/contact",
        permanent: true,
      },
      {
        source: "/shipping",
        destination: "/ecommerce/shipping",
        permanent: true,
      },
      {
        source: "/returns",
        destination: "/ecommerce/returns",
        permanent: true,
      },
      {
        source: "/privacy",
        destination: "/ecommerce/privacy",
        permanent: true,
      },
      {
        source: "/terms",
        destination: "/ecommerce/terms",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
          },
        ],
      },
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
