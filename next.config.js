/** @type {import('next').NextConfig} */
const nextConfig = {
  // Plaid Link injects a global script. React Strict Mode double-mounts effects
  // in development, which can embed Plaid Link twice and produce unstable local
  // Link behavior.
  reactStrictMode: false,
  swcMinify: true,
}

module.exports = nextConfig
