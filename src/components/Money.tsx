import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/hooks/useCurrency";

type MoneyProps = {
  amount: number;
  currency: string;
  className?: string;
  decimals?: number;
  /** colour by sign */
  signed?: boolean;
  hideConverted?: boolean;
  convertedClassName?: string;
};

export function Money({
  amount,
  currency,
  className,
  decimals,
  signed,
  hideConverted,
  convertedClassName,
}: MoneyProps) {
  const { base, convert } = useCurrency();
  const showConverted = !hideConverted && currency !== base;
  const converted = showConverted ? convert(amount, currency, base) : null;

  return (
    <span className="inline-flex flex-col items-end">
      <span
        className={cn(
          "num",
          signed && amount > 0 && "text-gain",
          signed && amount < 0 && "text-loss",
          className,
        )}
      >
        {signed && amount > 0 ? "+" : ""}
        {formatMoney(amount, currency, { decimals })}
      </span>
      {converted !== null && (
        <span className={cn("num text-[0.7rem] text-muted-foreground", convertedClassName)}>
          ≈ {formatMoney(converted, base, { decimals })}
        </span>
      )}
    </span>
  );
}
