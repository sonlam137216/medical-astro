// Link to a map for an address. It is a plain link to Google Maps' search page (no map or script is loaded on
// our pages); exact coordinates or a place link can replace it later (see the locations module, A4).

/** Opens a Google Maps search for the address. Empty address: null (nothing to point to). */
export function directionsUrl(address: string | null | undefined): string | null {
  const text = (address ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}
