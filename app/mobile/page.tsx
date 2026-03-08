"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function MobileTopPage() {
    const router = useRouter();
    const [time, setTime] = useState("");

    // Set viewport meta
    useEffect(() => {
        let metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
        if (!metaViewport) {
            metaViewport = document.createElement("meta");
            metaViewport.name = "viewport";
            document.head.appendChild(metaViewport);
        }
        metaViewport.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

        // Update time
        const updateTime = () => {
            const now = new Date();
            setTime(now.toLocaleDateString("ja-JP", {
                month: "long",
                day: "numeric",
                weekday: "short",
            }) + " " + now.toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
            }));
        };
        updateTime();
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, []);

    const menuItems = [
        {
            title: "ラベルAI取り込み",
            description: "商品ラベルを撮影してAIで原材料データを自動登録",
            emoji: "🏷️",
            gradient: "linear-gradient(135deg, #2563eb, #3b82f6)",
            shadowColor: "rgba(37,99,235,0.3)",
            href: "/recipe/database/label-import/mobile",
        },
        {
            title: "商品写真登録",
            description: "商品の写真を撮影してレシピに登録",
            emoji: "📸",
            gradient: "linear-gradient(135deg, #059669, #10b981)",
            shadowColor: "rgba(5,150,105,0.3)",
            href: "/recipe/photo/mobile",
        },
    ];

    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(180deg, #0f172a 0%, #1e293b 40%, #334155 100%)",
            paddingBottom: "env(safe-area-inset-bottom, 20px)",
        }}>
            {/* Header */}
            <div style={{
                padding: "40px 24px 32px",
                paddingTop: "max(40px, env(safe-area-inset-top))",
                textAlign: "center",
            }}>
                <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    fontSize: 34,
                    boxShadow: "0 8px 32px rgba(59,130,246,0.3)",
                }}>
                    📊
                </div>
                <h1 style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: "#fff",
                    letterSpacing: -0.5,
                    marginBottom: 4,
                }}>
                    TSA Mobile
                </h1>
                <p style={{
                    fontSize: 13,
                    color: "#94a3b8",
                    marginBottom: 4,
                }}>
                    Technical Staff AI System
                </p>
                {time && (
                    <p style={{
                        fontSize: 12,
                        color: "#64748b",
                        fontFamily: "monospace",
                    }}>
                        {time}
                    </p>
                )}
            </div>

            {/* Menu Items */}
            <div style={{
                padding: "0 20px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
            }}>
                {menuItems.map((item) => (
                    <button
                        key={item.title}
                        onClick={() => router.push(item.href)}
                        style={{
                            width: "100%",
                            padding: "24px 22px",
                            borderRadius: 20,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.06)",
                            backdropFilter: "blur(12px)",
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: 18,
                            transition: "all 0.2s ease",
                        }}
                    >
                        <div style={{
                            width: 60,
                            height: 60,
                            borderRadius: 16,
                            background: item.gradient,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 28,
                            flexShrink: 0,
                            boxShadow: `0 4px 20px ${item.shadowColor}`,
                        }}>
                            {item.emoji}
                        </div>
                        <div>
                            <div style={{
                                fontSize: 17,
                                fontWeight: 700,
                                color: "#f1f5f9",
                                marginBottom: 4,
                            }}>
                                {item.title}
                            </div>
                            <div style={{
                                fontSize: 12,
                                color: "#94a3b8",
                                lineHeight: 1.5,
                            }}>
                                {item.description}
                            </div>
                        </div>
                        <div style={{
                            marginLeft: "auto",
                            fontSize: 20,
                            color: "#475569",
                            flexShrink: 0,
                        }}>
                            →
                        </div>
                    </button>
                ))}
            </div>

            {/* Footer */}
            <div style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "16px 20px",
                paddingBottom: "max(16px, env(safe-area-inset-bottom))",
                textAlign: "center",
                background: "linear-gradient(transparent, rgba(15,23,42,0.8))",
            }}>
                <p style={{
                    fontSize: 11,
                    color: "#475569",
                }}>
                    © 2026 会津ブランド館
                </p>
            </div>
        </div>
    );
}
