import { useState } from "react";
import { useCountUp } from "@/hooks/useMotion";
import { cn } from "@/lib/utils";
import { formatMoney, formatReadableMoney } from "@/lib/format";
import { useCurrency } from "@/hooks/useCurrency";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  /**
   * Round for reading — £1.24M rather than £1,243,891. The exact figure stays
   * available on hover, and on tap for touch.
   */
  readable?: boolean | undefined;
  /** Count the figure up on its first appearance. Headline numbers only. */
  animate?: boolean | undefined;
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
  readable,
  animate,
}: MoneyProps) {
  const { base, convert } = useCurrency();
  const [revealed, setRevealed] = useState(false);
  const shown = useCountUp(amount, { enabled: animate === true });
  const showConverted = !hideConverted && currency !== base;
  const converted = showConverted ? convert(amount, currency, base) : null;

  const sign = signed && amount > 0 ? "+" : "";
  const exact = `${sign}${formatMoney(shown, currency, { decimals })}`;
  const short = `${sign}${formatReadableMoney(shown, currency)}`;
  const exactConverted = converted === null ? null : formatMoney(converted, base, { decimals });
  const shortConverted = converted === null ? null : formatReadableMoney(converted, base);

  const figureClass = cn(
    "num",
    signed && amount > 0 && "text-gain",
    signed && amount < 0 && "text-loss",
    className,
  );

  const wrapperClass = cn(
    "inline-flex flex-col",
    align === "right" ? "items-end" : "items-start",
  );

  if (!readable) {
    return (
      <span
        className={wrapperClass}
        title={exactConverted ? `${exact} ≈ ${exactConverted}` : undefined}
      >
        <span className={figureClass}>{exact}</span>
        {exactConverted && (
          <span
            className={cn("num text-xs leading-tight text-muted-foreground", convertedClassName)}
          >
            ≈ {exactConverted}
          </span>
        )}
      </span>
    );
  }

  const fullReading = exactConverted ? `${exact} ≈ ${exactConverted}` : exact;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={`${fullReading}. Select to show the exact figure.`}
          className={cn(
            wrapperClass,
            "rounded-sm text-left underline-offset-4 transition-colors hover:decoration-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className={figureClass}>{revealed ? exact : short}</span>
          {shortConverted && (
            <span
              className={cn("num text-xs leading-tight text-muted-foreground", convertedClassName)}
            >
              ≈ {revealed ? exactConverted : shortConverted}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="num text-xs">
        {fullReading}
      </TooltipContent>
    </Tooltip>
  );
}
