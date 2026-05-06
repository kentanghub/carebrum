import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export' removed to support API routes on Vercel
  // Static export disables API routes — we need serverless functions
};

export default nextConfig;
