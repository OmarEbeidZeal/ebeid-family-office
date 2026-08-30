import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/hooks/useCurrency";

type MoneyProps = {
  amount: number;
  currency: string;
  className?: string | undefined;
  decimals?: number | undefined;
  /** Colour and sign by direction. */
  signed?: boolean | undefined;
  hideConverted?: boolean | undefined;
  convertedClassName?: string | undefined;
  align?: "right" | "left" | undefined;
};

/**
 * Every monetary figure in the app renders through this component: tabular
 * numerals, the native currency on top, and the base-currency conversion
 * beneath whenever the two differ.
 */
export function Money({
  amount,
  currency,
  className,
  decimals,
  signed,
  hideConverted,
  convertedClassName,
  align = "right",
}: MoneyProps) {
  const { base, convert } = useCurrency();
  const showConverted = !hideConverted && currency !== base;
  const converted = showConverted ? convert(amount, currency, base) : null;

  return (
    <span
      className={cn("inline-flex flex-col", align === "right" ? "items-end" : "items-start")}
      title={
        converted !== null
          ? `${formatMoney(amount, currency, { decimals })} ≈ ${formatMoney(converted, base, { decimals })}`
          : undefined
      }
    >
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
        <span
          className={cn(
            "num text-[0.7rem] leading-tight text-muted-foreground",
            convertedClassName,
          )}
        >
          ≈ {formatMoney(converted, base, { decimals })}
        </span>
      )}
    </span>
  );
}
