"use client";

import { useEffect, ReactNode } from "react";

function isMobileDevice(): boolean {
    if (typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export default function MobileDetectWrapper({ children }: { children: ReactNode }) {
    useEffect(() => {
        if (isMobileDevice()) {
            // スマホからアクセスした場合、ログイン後のリダイレクト先を /mobile に設定
            const params = new URLSearchParams(window.location.search);
            if (!params.get("callbackUrl") && !params.get("redirect")) {
                // URLにcallbackUrl パラメータがない場合のみ /mobile を設定
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set("callbackUrl", "/mobile");
                window.history.replaceState({}, "", newUrl.toString());
            }
        }
    }, []);

    return <>{children}</>;
}
