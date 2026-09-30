'use client';

import { useMemo, useState } from 'react';
import type { AnnualRecord } from './finance-annual-summary';
import { downloadClosingPackage } from '@/lib/finance/closing-package-upload';

export type ClosingDocument = {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  downloadUrl: string | null;
  sourceHash: string;
  hasOriginal?: boolean;
  isPrimary: boolean;
  documentKinds: { kind: string; label: string; pages: number[] }[];
  warnings: string[];
};
export type ClosingPage = {
  documentId: string;
  pageNumber: number;
  kind: string;
  label: string;
  text?: string;
  rawText?: string;
  recordsCount: number;
  warnings: string[];
};
export type ClosingRecord = AnnualRecord & { id?: string; rowNo: number };
export type ClosingCoverage = {
  documents: number;
  pages: number;
  classifiedPages: number;
  records: number;
  amountRecords: number;
  reviewRecords: number;
};

export function FinanceClosingDocuments({
  documents,
  pages,
  records,
  coverage,
  periodId,
}: {
  documents: ClosingDocument[];
  pages: ClosingPage[];
  records: ClosingRecord[];
  coverage?: ClosingCoverage;
  periodId: string;
}) {
  const [section, setSection] = useState('all');
  const [documentId, setDocumentId] = useState('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [sourcePages, setSourcePages] = useState<ClosingPage[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [downloadState, setDownloadState] = useState('');
  const [downloading, setDownloading] = useState(false);
  const sections = useMemo(
    () => Array.from(new Set(records.map((row) => row.section))),
    [records],
  );
  const filtered = useMemo(
    () =>
      records.filter(
        (row) =>
          (section === 'all' || row.section === section) &&
          (documentId === 'all' || row.documentId === documentId),
      ),
    [records, section, documentId],
  );
  const visibleRows = filtered.slice(pageIndex * 100, (pageIndex + 1) * 100);
  const pageCount = Math.ceil(filtered.length / 100);
  const sectionLabel = (value: string) => documents.flatMap(document => document.documentKinds).find(kind => kind.kind === value)?.label
    || ({ tax_summary: '税額・欠損金集計', depreciation_summary: '減価償却集計', related_party_loan_detail: '役員借入内訳' } as Record<string, string>)[value] || value;

  async function showText(id: string) {
    setLoadingSource(true);
    setSourceError('');
    setSourcePages([]);
    try {
      const response = await fetch(
        `/api/finance/annual-statements?id=${periodId}&documentId=${id}`,
        { cache: 'no-store' },
      );
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error || '根拠ページを取得できませんでした');
      setSourcePages(
        (json.pages || []).filter(
          (page: ClosingPage) => page.documentId === id,
        ),
      );
    } catch (error) {
      setSourceError(
        error instanceof Error
          ? error.message
          : '根拠ページを取得できませんでした',
      );
    } finally {
      setLoadingSource(false);
    }
  }

  async function download(document: ClosingDocument) {
    if (!document.downloadUrl) {
      setDownloadState('この旧取込資料は原本PDFが保存されていません。');
      return;
    }
    setDownloading(true);
    setDownloadState('原本を取得中…');
    try {
      await downloadClosingPackage(
        { ...document, downloadUrl: document.downloadUrl },
        setDownloadState,
      );
      setDownloadState('原本PDFのハッシュ一致を確認して保存しました。');
    } catch (error) {
      setDownloadState(
        error instanceof Error
          ? error.message
          : '原本PDFを取得できませんでした',
      );
    } finally {
      setDownloading(false);
    }
  }

  if (!documents.length)
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        この年度は旧形式で取り込まれています。原本PDFを再投入すると、原本と全ページの資料分類も保存できます。
      </section>
    );
  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-900">決算資料一式・原本と根拠</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {coverage?.documents ?? documents.length}ファイル / 全
          {coverage?.pages ?? pages.length}ページ / 分類済み{' '}
          {coverage?.classifiedPages ?? 0}ページ / 数値をデータ化{' '}
          {coverage?.amountRecords ?? 0}
          項目（未照合候補を含む）。未確定のOCRは原文を残し、単位が不明な数値を円と断定しません。
        </p>
      </div>
      <div className="space-y-3">
        {documents.map((document) => (
          <article
            key={document.id}
            className="rounded-xl border border-slate-200 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-all text-sm font-semibold text-slate-800">
                  {document.fileName}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {document.pageCount}ページ /{' '}
                  {(document.fileSize / 1024 / 1024).toFixed(1)}MB{' '}
                  {document.isPrimary ? '/ 年次比較の決算書' : '/ 補足資料'}
                </div>
              </div>
              <div className="flex gap-3 text-sm font-semibold text-indigo-700">
                <button
                  type="button"
                  onClick={() => void download(document)}
                  disabled={downloading || document.hasOriginal === false}
                  className="disabled:text-slate-400"
                >
                  {document.hasOriginal === false
                    ? '旧取込：原本未保存'
                    : '原本PDFを取得'}
                </button>
                <button
                  type="button"
                  onClick={() => void showText(document.id)}
                  disabled={loadingSource}
                >
                  抽出原文を見る
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {document.documentKinds.map((kind) => (
                <span
                  key={kind.kind}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
                >
                  {kind.label}：{kind.pages.join(', ')}頁
                </span>
              ))}
            </div>
            {document.warnings.length > 0 && (
              <details className="mt-3 text-xs text-amber-800">
                <summary className="cursor-pointer">
                  資料の確認事項（{document.warnings.length}件）
                </summary>
                <ul className="mt-2 space-y-1">
                  {document.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
      {downloadState && (
        <p className="text-sm text-slate-600">{downloadState}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-600">
          資料{' '}
          <select
            className="ml-2 max-w-64 rounded-lg border border-slate-200 p-2"
            value={documentId}
            onChange={(event) => {
              setDocumentId(event.target.value);
              setPageIndex(0);
            }}
          >
            <option value="all">すべて</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.fileName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          区分{' '}
          <select
            className="ml-2 rounded-lg border border-slate-200 p-2"
            value={section}
            onChange={(event) => {
              setSection(event.target.value);
              setPageIndex(0);
            }}
          >
            <option value="all">すべて</option>
            {sections.map((value) => (
              <option key={value} value={value}>
                {sectionLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-500">{filtered.length}件</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="p-3 text-left">根拠頁</th>
              <th className="p-3 text-left">区分 / 内容</th>
              <th className="p-3 text-right">金額 / 数値候補</th>
              <th className="p-3 text-left">原文・補足</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row, index) => (
              <tr
                key={
                  row.id ||
                  `${row.documentId}:${row.page}:${row.rowNo}:${index}`
                }
              >
                <td className="p-3 align-top tabular-nums">{row.page}</td>
                <td className="max-w-80 p-3 align-top">
                  <div className="text-xs text-slate-500">{sectionLabel(row.section)}</div>
                  <div className="mt-1 break-words font-semibold">
                    {row.accountName}
                  </div>
                </td>
                <td className="whitespace-nowrap p-3 text-right align-top font-mono">
                  {row.amount == null ? (
                    <span className="text-xs text-amber-700">要確認</span>
                  ) : (
                    <><span>{`${row.amount < 0 ? '△' : ''}${Math.abs(row.amount).toLocaleString('ja-JP')}${row.metadata.extraction === 'single_labelled_amount' ? '' : '円'}`}</span>{row.metadata.extraction === 'single_labelled_amount' && <div className="text-xs font-sans text-amber-700">数値候補・単位要確認</div>}</>
                  )}
                </td>
                <td className="max-w-lg p-3 align-top">
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">根拠を表示</summary>
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">
                      {row.rawText}
                    </pre>
                    {row.metadata.ratePercent != null && (
                      <div>金利 {String(row.metadata.ratePercent)}％</div>
                    )}
                    {row.metadata.interestPaid != null && (
                      <div>
                        支払利息{' '}
                        {Number(row.metadata.interestPaid).toLocaleString(
                          'ja-JP',
                        )}
                        円
                      </div>
                    )}
                    {row.metadata.status != null && (
                      <div>読取状態：{({ reconciled: '小計照合済み', extracted: '単一金額読取', derived: '差額計算', needs_review: '要確認' } as Record<string, string>)[String(row.metadata.status)] || String(row.metadata.status)}</div>
                    )}
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-4 text-sm">
          <button
            type="button"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((value) => value - 1)}
          >
            前へ
          </button>
          <span>
            {pageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={pageIndex + 1 >= pageCount}
            onClick={() => setPageIndex((value) => value + 1)}
          >
            次へ
          </button>
        </div>
      )}
      {loadingSource && (
        <p className="text-sm text-slate-500">根拠ページを読み込み中…</p>
      )}
      {sourceError && <p className="text-sm text-rose-700">{sourceError}</p>}
      {sourcePages.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-semibold">
            <span>全ページの抽出原文（OCRの誤字を含みます）</span>
            <button type="button" onClick={() => setSourcePages([])}>
              閉じる
            </button>
          </div>
          {sourcePages.map((page) => (
            <details
              key={`${page.documentId}:${page.pageNumber}`}
              className="rounded-xl border border-slate-200 p-3"
            >
              <summary className="cursor-pointer text-sm">
                {page.pageNumber}ページ：{page.label}
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                {page.rawText || page.text || '文字情報なし。原本PDFを確認してください。'}
              </pre>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
