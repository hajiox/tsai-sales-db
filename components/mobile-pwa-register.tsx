"use client";

import { useEffect } from "react";
import type { BeforeInstallPromptEvent } from "@/components/pwa-install-button";

type InstallWindow = Window & {
  __tsaInstallPrompt?: BeforeInstallPromptEvent;
};

export function MobilePwaRegister() {
  useEffect(() => {
    const installWindow = window as InstallWindow;
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installWindow.__tsaInstallPrompt = event as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event("tsa-pwa-install-ready"));
    };
    const handleAppInstalled = () => {
      delete installWindow.__tsaInstallPrompt;
      window.dispatchEvent(new Event("tsa-pwa-installed"));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.removeEventListener("appinstalled", handleAppInstalled);
      };
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("TSA service worker registration failed:", error);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  return null;
}
