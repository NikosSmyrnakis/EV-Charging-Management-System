/** @type {import('next').NextConfig} */
const nextConfig = {

  reactStrictMode: false,
  async rewrites() {
    return [
      // expose spec URL -> internal /api URL
      { source: "/updpoint/:id", destination: "/api/updpoint/:id" },

      // (optional) if your spec uses reserve without /api too:
      { source: "/reserve/:id/:minutes", destination: "/api/reserve/:id/:minutes" },
      { source: "/reserve/:id", destination: "/api/reserve/:id" },

      // (optional) if spec uses point:
      { source: "/point/:id", destination: "/api/point/:id" },

      // (optional) points list:
      { source: "/points", destination: "/api/points" },
    ];
  },
};

module.exports = nextConfig;
