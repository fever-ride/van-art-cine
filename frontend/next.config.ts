import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.NEXT_PUBLIC_BASE_URL;
    if (!backend) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;