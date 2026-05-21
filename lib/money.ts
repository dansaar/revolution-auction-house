export function moneyToNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace("$", "").replaceAll(",", ""));
}

export function formatMoney(amount: number) {
  return `$${amount.toLocaleString()}`;
}
