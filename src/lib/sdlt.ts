/**
 * Stamp Duty Land Tax — England and Northern Ireland, 2026/27 rates.
 *
 * Pure arithmetic. Nothing here fetches, estimates or rounds a rate: the bands
 * are written out so the calculator can show its working line by line, which is
 * the only way a buyer can sanity-check a five-figure tax bill.
 *
 * Scotland (LBTT) and Wales (LTT) use different systems entirely and are not
 * modelled — the calculator says so rather than quoting an English figure for a
 * Scottish purchase.
 */

export type SdltBand = {
  /** Lower bound of the slice, exclusive of the previous band. */
  from: number;
  /** Upper bound, or null for the top band. */
  to: number | null;
  /** Base rate before surcharges, as a percentage. */
  baseRate: number;
  /** Rate actually charged on this slice, surcharges included. */
  rate: number;
  /** Portion of the price falling in this band. */
  taxable: number;
  duty: number;
};

export type SdltInput = {
  price: number;
  firstTimeBuyer: boolean;
  additionalProperty: boolean;
  nonUkResident: boolean;
};

export type SdltResult = {
  price: number;
  duty: number;
  /** Duty before the additional-property and non-resident surcharges. */
  baseDuty: number;
  surchargeDuty: number;
  effectiveRate: number;
  bands: SdltBand[];
  /** First-time-buyer relief was applied. */
  reliefApplied: boolean;
  /** The buyer ticked first-time buyer but relief could not apply. */
  reliefUnavailable: boolean;
  notes: string[];
};

type BandSpec = { threshold: number; rate: number };

/** Standard residential rates: 0% to £125k, 2%, 5%, 10%, 12% above £1.5m. */
const STANDARD_BANDS: BandSpec[] = [
  { threshold: 125_000, rate: 0 },
  { threshold: 250_000, rate: 2 },
  { threshold: 925_000, rate: 5 },
  { threshold: 1_500_000, rate: 10 },
  { threshold: Infinity, rate: 12 },
];

/** First-time-buyer relief: 0% to £300k then 5% to £500k. Nothing above £500k. */
const FIRST_TIME_BUYER_BANDS: BandSpec[] = [
  { threshold: 300_000, rate: 0 },
  { threshold: 500_000, rate: 5 },
];

export const FTB_RELIEF_CEILING = 500_000;
export const ADDITIONAL_PROPERTY_SURCHARGE = 5;
export const NON_RESIDENT_SURCHARGE = 2;

/**
 * The duty due on a residential purchase, band by band.
 * `price` of zero or less returns a zero result rather than throwing, so the
 * calculator can render before a figure has been typed.
 */
export function calculateSdlt(input: SdltInput): SdltResult {
  const price = Number.isFinite(input.price) ? Math.max(0, input.price) : 0;
  const notes: string[] = [];

  // Relief is only for buyers who own no other property anywhere in the world,
  // so it can never combine with the additional-property surcharge.
  const reliefBlockedByAdditional = input.firstTimeBuyer && input.additionalProperty;
  const reliefBlockedByPrice = input.firstTimeBuyer && price > FTB_RELIEF_CEILING;
  const reliefApplied =
    input.firstTimeBuyer && !reliefBlockedByAdditional && !reliefBlockedByPrice && price > 0;

  if (reliefBlockedByAdditional) {
    notes.push(
      "First-time-buyer relief cannot apply alongside the additional-property surcharge — relief requires owning no other property anywhere in the world, including overseas.",
    );
  }
  if (reliefBlockedByPrice) {
    notes.push(
      `First-time-buyer relief is withdrawn entirely above ${money(FTB_RELIEF_CEILING)}. At this price the standard bands apply in full.`,
    );
  }
  if (input.additionalProperty) {
    notes.push(
      `${ADDITIONAL_PROPERTY_SURCHARGE}% additional-property surcharge applied to every band. A property owned in Egypt, Jordan or anywhere else counts toward this test.`,
    );
  }
  if (input.nonUkResident) {
    notes.push(
      `${NON_RESIDENT_SURCHARGE}% non-UK-resident surcharge applied to every band. Residence here is the SDLT test — 183 days in the UK in the 12 months around completion — not tax residence under the statutory residence test.`,
    );
  }

  const surcharge =
    (input.additionalProperty ? ADDITIONAL_PROPERTY_SURCHARGE : 0) +
    (input.nonUkResident ? NON_RESIDENT_SURCHARGE : 0);

  const specs = reliefApplied ? FIRST_TIME_BUYER_BANDS : STANDARD_BANDS;

  const bands: SdltBand[] = [];
  let lower = 0;
  let duty = 0;
  let baseDuty = 0;

  for (const spec of specs) {
    const upper = Math.min(price, spec.threshold);
    const taxable = Math.max(0, upper - lower);
    const rate = spec.rate + surcharge;
    const bandDuty = (taxable * rate) / 100;
    bands.push({
      from: lower,
      to: Number.isFinite(spec.threshold) ? spec.threshold : null,
      baseRate: spec.rate,
      rate,
      taxable,
      duty: bandDuty,
    });
    duty += bandDuty;
    baseDuty += (taxable * spec.rate) / 100;
    lower = spec.threshold;
    if (price <= spec.threshold) break;
  }

  return {
    price,
    duty,
    baseDuty,
    surchargeDuty: duty - baseDuty,
    effectiveRate: price > 0 ? (duty / price) * 100 : 0,
    bands,
    reliefApplied,
    reliefUnavailable: reliefBlockedByAdditional || reliefBlockedByPrice,
    notes,
  };
}

function money(value: number) {
  return `£${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value)}`;
}

export function bandLabel(band: SdltBand) {
  const from = money(band.from);
  if (band.to === null) return `Above ${from}`;
  if (band.from === 0) return `Up to ${money(band.to)}`;
  return `${from} to ${money(band.to)}`;
}

/**
 * The other costs a UK purchase carries, as prompts rather than figures. The
 * household types the quote it was actually given — the platform never fills in
 * a solicitor's fee it has not been told.
 */
export const UK_PROPERTY_PROMPTS: { label: string; kind: string; hint: string }[] = [
  { label: "Purchase price", kind: "purchase", hint: "The agreed price, before anything else" },
  { label: "Stamp duty (SDLT)", kind: "tax", hint: "Calculated below once a price is entered" },
  { label: "Solicitor / conveyancing", kind: "fees", hint: "Legal fees plus VAT" },
  { label: "Searches", kind: "fees", hint: "Local authority, drainage, environmental" },
  { label: "Survey", kind: "survey", hint: "Homebuyer report or full structural" },
  { label: "Mortgage arrangement fee", kind: "mortgage", hint: "Product and valuation fees" },
  { label: "Moving costs", kind: "moving", hint: "Removals, storage, cleaning" },
  { label: "Initial furnishing", kind: "furnishing", hint: "What the flat needs on day one" },
  { label: "Contingency", kind: "contingency", hint: "Typically 5–10% of the all-in cost" },
];

/** Room-by-room prompts for furnishing a home. Costs stay blank until entered. */
export const FURNISHING_PROMPTS: { label: string; kind: string; hint: string }[] = [
  { label: "Living room", kind: "furnishing", hint: "Seating, storage, lighting, rugs" },
  { label: "Kitchen", kind: "furnishing", hint: "Appliances, cookware, table and chairs" },
  { label: "Master bedroom", kind: "furnishing", hint: "Bed, wardrobes, mattress, linen" },
  { label: "Second bedroom", kind: "furnishing", hint: "Bed, storage, desk" },
  { label: "Bathrooms", kind: "furnishing", hint: "Fittings, mirrors, towels" },
  { label: "Terrace / outdoor", kind: "furnishing", hint: "Seating, shade, planting" },
  { label: "Air conditioning", kind: "furnishing", hint: "Units and installation" },
  { label: "Installation & delivery", kind: "fees", hint: "Fitting, delivery, assembly" },
  { label: "Contingency", kind: "contingency", hint: "What always turns up late" },
];
