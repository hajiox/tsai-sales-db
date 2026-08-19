"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share2, X } from "lucide-react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

type InstallWindow = Window & {
  __tsaInstallPrompt?: BeforeInstallPromptEvent;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function PwaInstallButton() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const installWindow = window as InstallWindow;
    const navigatorWithStandalone = navigator as NavigatorWithStandalone;
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true;

    setIsInstalled(installed);
    setCanPrompt(Boolean(installWindow.__tsaInstallPrompt));
    setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent));

    const handleReady = () => setCanPrompt(Boolean(installWindow.__tsaInstallPrompt));
    const handleInstalled = () => {
      setIsInstalled(true);
      setCanPrompt(false);
      setShowGuide(false);
    };

    window.addEventListener("tsa-pwa-install-ready", handleReady);
    window.addEventListener("tsa-pwa-installed", handleInstalled);
    return () => {
      window.removeEventListener("tsa-pwa-install-ready", handleReady);
      window.removeEventListener("tsa-pwa-installed", handleInstalled);
    };
  }, []);

  if (isInstalled) {
    return (
      <span className="hidden h-10 items-center gap-1 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 sm:inline-flex">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        追加済み
      </span>
    );
  }

  const requestInstall = async () => {
    const installWindow = window as InstallWindow;
    const prompt = installWindow.__tsaInstallPrompt;

    if (!prompt) {
      setShowGuide(true);
      return;
    }

    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      delete installWindow.__tsaInstallPrompt;
      setCanPrompt(false);
      if (choice.outcome === "accepted") setIsInstalled(true);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={requestInstall}
        disabled={installing}
        className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white active:bg-slate-700 disabled:opacity-60"
        aria-label="TSAをホーム画面に追加"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {installing ? "確認中" : canPrompt ? "アプリ追加" : "追加方法"}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setShowGuide(false)}
            aria-label="追加方法を閉じる"
          />
          <section className="relative w-full max-w-md rounded-t-lg bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-lg">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-slate-600" aria-hidden="true" />
                <h2 id="pwa-install-title" className="text-base font-bold text-slate-950">
                  ホーム画面に追加
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="grid h-11 w-11 place-items-center text-slate-600"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="space-y-4 px-4 py-4 text-sm leading-6 text-slate-700">
              {isIos ? (
                <>
                  <p className="font-semibold text-slate-950">iPhone・iPadはSafariで追加します。</p>
                  <ol className="space-y-2">
                    <li><strong>1.</strong> このページをSafariで開く</li>
                    <li><strong>2.</strong> 共有ボタンを押す</li>
                    <li><strong>3.</strong> 「ホーム画面に追加」を選ぶ</li>
                    <li><strong>4.</strong> 「Webアプリとして開く」をオンにして追加</li>
                  </ol>
                  <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600">
                    項目がない場合は、共有メニュー最下部の「アクションを編集」から追加できます。
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-slate-950">ブラウザのメニューから追加できます。</p>
                  <ol className="space-y-2">
                    <li><strong>1.</strong> Chromeのメニューを開く</li>
                    <li><strong>2.</strong> 「アプリをインストール」または「ホーム画面に追加」を選ぶ</li>
                  </ol>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
