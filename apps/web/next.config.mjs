import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@tweetquote/config",
    "@tweetquote/domain",
    "@tweetquote/editor-core",
    "@tweetquote/render-core",
    "@tweetquote/sdk",
    "@tweetquote/telemetry",
    "@tweetquote/ui",
  ],
  turbopack: {
    root: path.resolve(configDir, "../.."),
  },
};

export default nextConfig;
