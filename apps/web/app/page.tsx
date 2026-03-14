import Link from "next/link";
import { Button, QuotePreview, StatBadge, SurfaceCard } from "@tweetquote/ui";
import { createEmptyDocument } from "@tweetquote/domain";

const demoDocument = createEmptyDocument({
  title: "Demo quote",
  nodes: [
    {
      id: "1",
      relation: "root",
      depth: 0,
      sourceTweetId: "1",
      author: { name: "Paul Graham", handle: "paulg", avatarUrl: "", isVerified: false },
      content: "Writing helps you find out what you think.",
      createdAt: "",
      viewCount: 1024,
      media: [],
      translation: {
        provider: "ai",
        status: "success",
        language: "zh-CN",
        text: "写作能帮助你发现自己真正的想法。",
        annotations: [],
        error: "",
        version: 1,
      },
    },
    {
      id: "2",
      relation: "quote",
      depth: 1,
      sourceTweetId: "2",
      author: { name: "TweetQuote", handle: "tweetquoteapp", avatarUrl: "", isVerified: false },
      content: "Context matters more when the point is subtle.",
      createdAt: "",
      viewCount: 512,
      media: [],
      translation: {
        provider: "none",
        status: "idle",
        language: "zh-CN",
        text: "",
        annotations: [],
        error: "",
        version: 0,
      },
    },
  ],
});

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="hero-grid">
        <div className="card-grid">
          <div>
            <span className="eyebrow">TweetQuote 2.0 Architecture</span>
            <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", lineHeight: 1.05, margin: "18px 0 16px" }}>
              把引用链整理成真正可维护、可分享、可迭代的产品。
            </h1>
            <p className="muted" style={{ fontSize: 18, lineHeight: 1.8, maxWidth: 760 }}>
              新版架构将营销站、编辑器、API 和插件彻底拆开，保留当前核心能力，同时建立统一领域模型、共享 SDK 和可持续组件体系。
            </p>
          </div>

          <div className="row">
            <Link href="/editor">
              <Button>打开新版编辑器</Button>
            </Link>
            <Link href="https://x.com/maiyangai" target="_blank">
              <Button tone="secondary">联系作者</Button>
            </Link>
          </div>

          <div className="row">
            <StatBadge label="React + Next.js Web" />
            <StatBadge label="Fastify API" />
            <StatBadge label="MV3 Extension" />
          </div>
        </div>

        <SurfaceCard title="输出物预览" subtitle="新版界面延续当前产品定位，但将编辑、翻译、预览和导出能力分离为可维护模块。">
          <QuotePreview document={demoDocument} />
        </SurfaceCard>
      </div>
    </main>
  );
}
