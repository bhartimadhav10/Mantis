/** @type {import('next').NextConfig} */
const nextConfig = {
  // MOSS ships a native (napi) binding — keep it external so Next doesn't try
  // to bundle the .node files.
  experimental: {
    serverComponentsExternalPackages: [
      "@moss-dev/moss",
      "@moss-dev/moss-core",
      "pdf-parse",
      "pdfjs-dist",
      "@distube/ytdl-core",
      "ffmpeg-static",
    ],
  },
};
export default nextConfig;
