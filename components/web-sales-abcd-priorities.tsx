import type { Priority } from "@/lib/web-sales-abcd/priorities";

const styles = {
  red: "border-red-600 bg-red-50 text-red-950",
  amber: "border-amber-600 bg-amber-50 text-amber-950",
  blue: "border-blue-600 bg-blue-50 text-blue-950",
  green: "border-emerald-600 bg-emerald-50 text-emerald-950",
};
export default function AbcdPriorities({ priorities, compact = false }: { priorities: Priority[]; compact?: boolean }) {
  return <div className={compact ? "space-y-3" : "grid lg:grid-cols-2 gap-4"}>
    {(compact ? priorities.slice(0, 2) : priorities).map((task, index) => <article key={task.id} className={`rounded-xl border-l-4 p-4 md:p-5 ${styles[task.tone]}`}>
      <p className="text-sm font-bold mb-2">優先 {index + 1} · 対象 {task.count}商品</p>
      <h3 className={`${compact ? "text-xl" : "text-xl md:text-2xl"} font-extrabold leading-snug`}>{task.title}</h3>
      <p className="mt-3 text-base font-medium leading-relaxed">{task.instruction}</p>
      {!!task.products.length && <div className="mt-3 text-sm leading-relaxed"><p className="font-bold">着手する商品例</p><ul className="list-disc pl-5 space-y-1 mt-1">{task.products.slice(0, compact ? 1 : 3).map(product => <li key={product.key} className="break-words">{product.name}<span className="text-xs ml-1">（{product.key}）</span></li>)}</ul></div>}
    </article>)}
  </div>;
}
