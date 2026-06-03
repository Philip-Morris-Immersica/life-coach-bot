/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bcryptjs/jose работят добре в Node runtime. Принуждаваме API роутовете
  // да са dynamic, защото четат от Neon и/или ENV.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
