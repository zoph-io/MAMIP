/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Use basePath only for GitHub Pages deployment
  // Set NEXT_PUBLIC_USE_BASE_PATH=true for GitHub Pages
  basePath: process.env.NEXT_PUBLIC_USE_BASE_PATH === "true" ? "/MAMIP" : "",
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
