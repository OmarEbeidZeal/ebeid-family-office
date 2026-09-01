/**
 * Minimal PDFs built by hand, for testing what the reader does with a font
 * that lies about its own characters.
 *
 * The household's Trading 212 statements declare a `ToUnicode` map covering
 * the letters and blanking the numerals. Nothing about that file is unusual
 * except the map, so the fixtures reproduce exactly that: identical page
 * content, four different maps.
 */

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function cmap(body: string): string {
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapName /Fixture def
/CMapType 2 def
1 begincodespacerange
<20> <7E>
endcodespacerange
${body}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

/** Every printable character maps to itself: a file that reads correctly. */
export const TO_UNICODE_COMPLETE = cmap("1 beginbfrange\n<20> <7E> <0020>\nendbfrange");

/** Digits map to U+0000 — present in the map, and pointing at nothing. */
export const TO_UNICODE_DIGITS_ZEROED = cmap(
  `10 beginbfchar\n${Array.from({ length: 10 }, (_, digit) => `<3${digit}> <0000>`).join(
    "\n",
  )}\nendbfchar\n2 beginbfrange\n<20> <2F> <0020>\n<3A> <7E> <003A>\nendbfrange`,
);

/** Digits map to a space — the read that returns "£ ,   .  " and looks fine. */
export const TO_UNICODE_DIGITS_SPACED = cmap(
  `10 beginbfchar\n${Array.from({ length: 10 }, (_, digit) => `<3${digit}> <0020>`).join(
    "\n",
  )}\nendbfchar\n2 beginbfrange\n<20> <2F> <0020>\n<3A> <7E> <003A>\nendbfrange`,
);

/** Digits absent from the map altogether. */
export const TO_UNICODE_DIGITS_MISSING = cmap(
  "2 beginbfrange\n<20> <2F> <0020>\n<3A> <7E> <003A>\nendbfrange",
);

function escapeText(line: string): string {
  return line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export type PdfFixture = {
  /** One line of text per entry, drawn down the page. */
  lines: string[];
  /** The `ToUnicode` CMap the font declares. */
  toUnicode: string;
};

/**
 * A one-page PDF drawing `lines` in Helvetica with the given character map.
 * Written by hand rather than by a library so the map is exactly as stated.
 */
export function buildPdf({ lines, toUnicode }: PdfFixture): Uint8Array {
  const content =
    "BT /F1 12 Tf 16 TL 56 760 Td\n" +
    lines.map((line) => `(${escapeText(line)}) Tj T*`).join("\n") +
    "\nET";

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /ToUnicode 6 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Length ${toUnicode.length} >>\nstream\n${toUnicode}\nendstream`,
  ];

  const parts: Uint8Array[] = [encode("%PDF-1.4\n")];
  const offsets: number[] = [];
  let length = parts[0]!.length;

  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = encode(`${index + 1} 0 obj\n${body}\nendobj\n`);
    parts.push(chunk);
    length += chunk.length;
  });

  const xrefStart = length;
  const xref = [
    `xref`,
    `0 ${objects.length + 1}`,
    `0000000000 65535 f `,
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    `trailer`,
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref`,
    `${xrefStart}`,
    `%%EOF`,
    ``,
  ].join("\n");

  parts.push(encode(xref));
  return concat(parts);
}

/** The statement lines every fixture prints, digits and all. */
export const STATEMENT_LINES = [
  "Trading 212 UK Ltd Account Statement",
  "Account holder EBEID OMAR",
  "Account type Stocks and Shares ISA",
  "Period 01 Jan 2025 to 31 Mar 2025",
  "Opening balance GBP 1,250.75",
  "Deposit 14 Jan 2025 GBP 3,000.00",
  "Buy VUSA 12 shares at GBP 82.41",
  "Buy MSFT 4 shares at USD 411.20",
  "Dividend 28 Feb 2025 GBP 46.18",
  "Sell VUSA 3 shares at GBP 88.02",
  "Currency conversion fee GBP 1.94",
  "Interest on uninvested cash GBP 12.07",
  "Deposit 03 Mar 2025 GBP 2,000.00",
  "Withdrawal 19 Mar 2025 GBP 500.00",
  "Buy VWRL 9 shares at GBP 104.55",
  "Dividend 21 Mar 2025 GBP 18.30",
  "Total deposits for the period GBP 5,000.00",
  "Total withdrawals for the period GBP 500.00",
  "Closing balance GBP 6,397.10",
  "This statement is issued by Trading 212 UK Ltd",
];
