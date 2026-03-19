import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(configDir, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** 生成可独立运行的最小服务端目录，适合小内存 VPS：在内存充足的机器上 build，再把 standalone 同步到服务器 */
  output: "standalone",
  /** 让依赖追踪从仓库根开始，workspace 包能被正确打进 standalone */
  outputFileTracingRoot: monorepoRoot,
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
    root: monorepoRoot,
  },
};

export default nextConfig;
