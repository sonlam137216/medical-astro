// Where a service links to. Only some services have a page of their own (written by hand, not generated from
// the CMS); the others are shown on the Services page, so their cards link to their place on that page.
const OWN_PAGES: Record<string, string> = {
  'dental-implants': '/services/dental-implants',
};

export function servicePath(slug: string): { href: string; hasPage: boolean } {
  const page = OWN_PAGES[slug];
  return page ? { href: page, hasPage: true } : { href: `/services#${slug}`, hasPage: false };
}

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
