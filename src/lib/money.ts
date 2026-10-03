export function toSatang(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Invalid money value: ${text}`);
  const cents = BigInt(match[2]) * BigInt(100) + BigInt((match[3] || "").padEnd(2, "0"));
  const signed = match[1] ? -cents : cents;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Money value exceeds safe integer range");
  return Number(signed);
}

export function fromSatang(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error("Money must be a safe integer number of satang");
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
