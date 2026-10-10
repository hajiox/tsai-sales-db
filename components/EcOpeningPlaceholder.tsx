/** A reserved storefront slot; no sales or acquisition is inferred. */
export function EcOpeningPlaceholder({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center ${className}`}>
    <p className="text-sm font-semibold text-slate-700">makeshop</p>
    <p className="mt-2 text-xs text-slate-500">開店準備中</p>
  </div>;
}
