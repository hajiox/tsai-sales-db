import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/mobile",
    name: "TSA 業務システム",
    short_name: "TSA",
    description: "TSAのスマートフォン業務ポータル",
    start_url: "/mobile",
    scope: "/",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#111827",
    orientation: "portrait-primary",
    lang: "ja",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/tsa-mobile-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/tsa-mobile-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/tsa-mobile-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/tsa-mobile-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "チャーシュー納品書撮影",
        short_name: "納品書撮影",
        description: "納品書を撮影してチャーシュー製造原価へ送信",
        url: "/recipe/char-siu-production/scan",
        icons: [
          {
            src: "/tsa-mobile-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "ラベルAI取り込み",
        short_name: "ラベルAI",
        description: "商品ラベルを撮影して材料データを取り込み",
        url: "/recipe/database/label-import/mobile",
        icons: [
          {
            src: "/tsa-mobile-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "商品写真登録",
        short_name: "商品写真",
        description: "商品写真を撮影してレシピへ登録",
        url: "/recipe/photo/mobile",
        icons: [
          {
            src: "/tsa-mobile-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "決算棚卸し",
        short_name: "棚卸し",
        description: "ブランド館の決算棚卸しを入力",
        url: "/brand-store-analysis/inventory",
        icons: [
          {
            src: "/tsa-mobile-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
