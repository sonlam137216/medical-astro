// Link helpers shared by the layout and the tests (no Worker or Node APIs).

/**
 * The consultation form is a block on the page (`#consultation`). A page that has no such block sends visitors to
 * the Home page's form instead of leaving a link that does nothing.
 */
export function pageLink(href: string, pageHasConsultation: boolean): string {
  return !pageHasConsultation && href === '#consultation' ? '/#consultation' : href;
}
