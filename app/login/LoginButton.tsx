"use client"
import { signIn } from "next-auth/react"
import { useState, useEffect } from "react"

function isInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  // Common in-app browser identifiers
  const inAppPatterns = [
    /FBAN|FBAV/i,       // Facebook / Messenger
    /Instagram/i,        // Instagram
    /Line\//i,           // LINE
    /KAKAOTALK/i,        // KakaoTalk
    /Twitter/i,          // Twitter/X
    /MicroMessenger/i,   // WeChat
    /Snapchat/i,         // Snapchat
    /Pinterest/i,        // Pinterest
    /wv\)/i,             // Android WebView
  ];
  return inAppPatterns.some(pattern => pattern.test(ua));
}

function getExternalBrowserUrl(): string {
  const currentUrl = window.location.href;
  const ua = navigator.userAgent || "";

  // iOS: try Safari via intent
  if (/iPhone|iPad|iPod/i.test(ua)) {
    // On iOS, opening in Safari can be done via a special URL trick
    // but intent:// doesn't work. We'll show copy instructions instead.
    return currentUrl;
  }

  // Android: use intent:// to open in Chrome
  if (/Android/i.test(ua)) {
    const url = new URL(currentUrl);
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  return currentUrl;
}

export default function LoginButton() {
  const [isWebView, setIsWebView] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/sales/dashboard");

  useEffect(() => {
    setIsWebView(isInAppBrowser());

    // Check if there's a redirect parameter
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("callbackUrl") || params.get("redirect");
    if (redirect) {
      setCallbackUrl(redirect);
    }
  }, []);

  // WebView detected - show instructions to open in external browser
  if (isWebView) {
    const currentUrl = window.location.href;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);

    const handleCopyUrl = async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch {
        // Fallback: select text
        const input = document.createElement("input");
        input.value = currentUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    };

    const handleOpenExternal = () => {
      if (isAndroid) {
        window.location.href = getExternalBrowserUrl();
      } else {
        // iOS: just copy
        handleCopyUrl();
      }
    };

    return (
      <div style={{ width: "100%", textAlign: "center" }}>
        <div style={{
          padding: "16px",
          borderRadius: 14,
          background: "#fef3c7",
          border: "1px solid #fde68a",
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            アプリ内ブラウザでは<br />Googleログインができません
          </div>
          <div style={{ fontSize: 12, color: "#a16207", lineHeight: 1.6 }}>
            Messenger / LINE 等からのアクセスの場合、<br />
            外部ブラウザで開き直してください
          </div>
        </div>

        {isAndroid && (
          <button
            onClick={handleOpenExternal}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #2563eb, #3b82f6)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 10,
              boxShadow: "0 4px 16px rgba(37,99,235,0.3)",
            }}
          >
            🌐 Chromeで開く
          </button>
        )}

        <button
          onClick={handleCopyUrl}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            border: isAndroid ? "2px solid #e2e8f0" : "none",
            background: isAndroid ? "#fff" : "linear-gradient(135deg, #2563eb, #3b82f6)",
            color: isAndroid ? "#475569" : "#fff",
            fontSize: isAndroid ? 14 : 16,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 12,
            boxShadow: isAndroid ? "none" : "0 4px 16px rgba(37,99,235,0.3)",
          }}
        >
          {copied ? "✅ コピーしました！" : "📋 URLをコピーして外部ブラウザで開く"}
        </button>

        {isIOS && (
          <div style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "#f1f5f9",
            fontSize: 12,
            color: "#64748b",
            lineHeight: 1.6,
          }}>
            <strong>手順:</strong><br />
            ① 上のボタンでURLをコピー<br />
            ② Safariを開く<br />
            ③ アドレスバーに貼り付けてアクセス
          </div>
        )}
      </div>
    );
  }

  // Normal browser - show Google login button
  return (
    <button
      className="rounded-xl bg-blue-600 px-8 py-4 font-bold text-white hover:bg-blue-700 text-base w-full max-w-xs transition-all shadow-lg"
      onClick={() => signIn("google", { callbackUrl })}
    >
      Googleでログイン
    </button>
  )
}
