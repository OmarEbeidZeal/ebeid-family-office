import { useEffect, useState } from "react";
import { bankDomain, monogram } from "@/lib/ai/banks";
import { bankLogosAvailable } from "@/lib/bank-logos";
import { cn } from "@/lib/utils";

/**
 * A bank's mark, or its initials.
 *
 * The monogram is drawn first and the logo layered over it, so a bank we have
 * no mark for still reads as something deliberate rather than a broken image.
 */
export function BankMark({
  institution,
  domain,
  size = 28,
  className,
}: {
  institution?: string | null | undefined;
  domain?: string | null | undefined;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const resolved = domain ?? bankDomain(institution ?? null);
  const [failed, setFailed] = useState(false);
  const [marksAvailable, setMarksAvailable] = useState(false);
  const initials = monogram(institution ?? resolved ?? "");

  useEffect(() => {
    let live = true;
    void bankLogosAvailable().then((available) => {
      if (live) setMarksAvailable(available);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border bg-surface-2 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
      {resolved && marksAvailable && !failed && (
        <img
          src={`/api/public/bank-logo?domain=${encodeURIComponent(resolved)}&size=${size * 2}`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full bg-surface-2 object-contain"
        />
      )}
    </span>
  );
}
