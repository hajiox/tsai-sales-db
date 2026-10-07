import { calculateIngredientPackRequirement } from "@/lib/recipe-ingredient-pack";

interface IngredientPackRequirementProps {
  usage: number | string | null | undefined;
  batchSize: number;
  packQuantity: number | null;
  compact?: boolean;
}

export default function IngredientPackRequirement({
  usage,
  batchSize,
  packQuantity,
  compact = false,
}: IngredientPackRequirementProps) {
  const requirement = calculateIngredientPackRequirement(usage, batchSize, packQuantity);
  if (!requirement) {
    return <div className="mt-0.5 text-[10px] font-normal text-gray-400">必要個数 未設定</div>;
  }

  const usedText = requirement.usedPacks > 0 && requirement.usedPacks < 0.01
    ? "0.01個未満"
    : `${requirement.usedPacks.toLocaleString("ja-JP", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}個分`;

  return (
    <div className={compact ? "mt-0.5 text-[9px] leading-tight" : "mt-1 text-xs leading-tight"}>
      <span className="font-bold">必要 {requirement.requiredPacks.toLocaleString("ja-JP")}個</span>
      <span className="ml-1 font-normal opacity-75">（{usedText}）</span>
    </div>
  );
}
