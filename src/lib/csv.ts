export type CsvCell = string | number | boolean | null | undefined;

/** RFC 4180-ish CSV: quotes, commas and newlines are escaped; rows end with CRLF. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<CsvCell>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\r\n");
}
