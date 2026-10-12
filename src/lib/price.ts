// Price text is written freely in the admin ("From 600$", "TOTAL: $1,000", "C$1,250"). The design writes the
// dollar sign after the number ("600$"); English readers expect it before. Only that case is changed: a sign
// already in front (with or without a country prefix such as "C$" or "A$") is left alone.

/** "From 600$" -> "From $600"; "TOTAL: 1,000 $" -> "TOTAL: $1,000". Other text is returned unchanged. */
export function tidyPrice(text: string): string {
  return text.replace(
    /(^|[^\w$])(\d[\d,.]*)\s?\$(?![\w$])/g,
    (_, before: string, amount: string) => {
      return `${before}$${amount}`;
    },
  );
}
