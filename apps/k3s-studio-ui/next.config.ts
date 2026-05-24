import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // destination: `${process.env.BACKEND_URL ?? "http://192.168.0.209:9090"}/api/:path*`,
        destination: `http://192.168.0.209:9090/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
