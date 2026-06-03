export function formatPercent(value: number, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
