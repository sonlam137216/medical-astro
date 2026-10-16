// The main menu with its drop-downs. In the admin, a link of the main menu can be given a "drop-down group" name;
// links with the same name (letter case and spaces around it ignored) are shown together in a drop-down with that
// name, at the place of the first of them. Pure code (no imports) so it can be unit-tested with `node --test`.

export interface MenuLink {
  label: string;
  href: string;
}

export interface MenuGroup {
  label: string;
  /** The name itself links to a page (Services); absent: the name only opens the drop-down (Guides). */
  href?: string;
  links: MenuLink[];
}

export type MenuItem = MenuLink | MenuGroup;

export const isMenuGroup = (item: MenuItem): item is MenuGroup => 'links' in item;

/** Longest group name (mirrors the CHECK constraint of navigation_items.menu_group). */
export const MENU_GROUP_MAX = 40;

/** The links of a menu, in order, with the ones that share a group gathered into one drop-down. */
export function groupMenu(
  items: readonly { label: string; href: string; group?: string | null }[],
): MenuItem[] {
  const out: MenuItem[] = [];
  const groups = new Map<string, MenuGroup>();
  for (const { label, href, group } of items) {
    const name = group?.trim();
    if (!name) {
      out.push({ label, href });
      continue;
    }
    const key = name.toLowerCase();
    let found = groups.get(key);
    if (!found) {
      found = { label: name, links: [] };
      groups.set(key, found);
      out.push(found);
    }
    found.links.push({ label, href });
  }
  return out;
}

/** Address of the Services page: its main menu link opens a drop-down of the services. */
export const SERVICES_PATH = '/services';

/**
 * The main menu link to the Services page becomes a drop-down of the services, so a service added in the admin is
 * in the menu without a menu link of its own. The name still links to the Services page. Nothing changes when there
 * are no services, or when the link is already in a drop-down group.
 */
export function withServicesMenu(
  items: readonly MenuItem[],
  services: readonly MenuLink[],
): MenuItem[] {
  if (services.length === 0) return [...items];
  return items.map((item) =>
    !isMenuGroup(item) && item.href.replace(/\/$/, '') === SERVICES_PATH
      ? { label: item.label, href: item.href, links: [...services] }
      : item,
  );
}

/** Form check of a menu link (admin): only the main menu has drop-downs. */
export function menuGroupError(value: { location?: unknown; menu_group?: unknown }): string | null {
  if (
    typeof value.menu_group === 'string' &&
    value.menu_group !== '' &&
    value.location !== 'header'
  )
    return 'Only links of the main menu can be in a drop-down. Clear this box, or show the link in the main menu.';
  return null;
}
