import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ai-infra-studio/ui', '@ai-infra-studio/types'],
};

export default nextConfig;

