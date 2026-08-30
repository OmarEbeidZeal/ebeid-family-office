import { SectionHeader } from "@/components/SectionHeader";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExposureSlice } from "@/lib/portfolio";

const UNKNOWN_LABELS = ["Unclassified", "Unknown region"];

function Panel({
  title,
  description,
  slices,
  base,
  centreLabel,
  loading,
}: {
  title: string;
  description: string;
  slices: ExposureSlice[];
  base: string;
  centreLabel: string;
  loading?: boolean | undefined;
}) {
  const unclassified = slices.filter((slice) => !slice.classified);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader title={title} description={description} />
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : slices.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Exposure is built from the provider's company profiles. It appears once at least one
          holding has a live price and a profile.
        </p>
      ) : (
        <>
          <AllocationDonut
            slices={slices.map((slice) => ({ name: slice.name, value: slice.value }))}
            base={base}
            centreLabel={centreLabel}
            emphasise={UNKNOWN_LABELS}
          />
          {unclassified.length > 0 && total > 0 && (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {((unclassified.reduce((sum, slice) => sum + slice.value, 0) / total) * 100).toFixed(
                1,
              )}
              % sits in positions the provider gives no classification for — funds and ETFs usually.
              It is shown as unclassified rather than assigned to a guess.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ExposurePanel({
  sectors,
  regions,
  base,
  loading,
}: {
  sectors: ExposureSlice[];
  regions: ExposureSlice[];
  base: string;
  loading?: boolean | undefined;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Sector exposure"
        description="Priced positions grouped by the industry the provider reports."
        slices={sectors}
        base={base}
        centreLabel="Priced"
        loading={loading}
      />
      <Panel
        title="Geographic exposure"
        description="Where the listed companies are domiciled. It is not the same as where revenue is earned."
        slices={regions}
        base={base}
        centreLabel="Priced"
        loading={loading}
      />
    </div>
  );
}
