/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Use basePath only in production (GitHub Pages)
  basePath: process.env.NODE_ENV === "production" ? "/MAMIP" : "",
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
