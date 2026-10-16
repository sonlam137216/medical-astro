// Every service has a page at /services/<slug>. Most are built from the CMS by src/pages/services/[slug].astro;
// the ones listed here have a page written by hand at the same address, which the generic page leaves alone.
export const HAND_BUILT_SERVICE_PAGES: readonly string[] = ['dental-implants'];

export const servicePath = (slug: string) => `/services/${slug}`;

/** "$600", "A$1,250.50": a reference price as the cards show it (whole amounts without decimals). */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
