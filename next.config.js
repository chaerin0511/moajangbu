/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['node:sqlite'] }
};
module.exports = nextConfig;
