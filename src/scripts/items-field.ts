// Admin-only. The lists of cards or rows in a form (`items` fields, Field.astro) get "Remove" and "Add" buttons.
// Every slot is in the page (the ones past the filled ones hidden), so the buttons only show, hide and clear
// slots; the inputs keep being sent the normal way and the server leaves empty slots out. After each change
// the inputs are renumbered in the order shown, so the saved order is the order on screen. Without JavaScript
// the form keeps its two empty slots and "save and come back" to add more.
const NAME = /^(.+?)__\d+__(.+)$/;

// The Workers types declare their own `Element` (remove() returns it), so a select cannot be a querySelectorAll type
// argument: cast like the other admin scripts.
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const controls = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll(selector)) as unknown as Control[];

function renumber(list: HTMLElement) {
  list.querySelectorAll<HTMLElement>('[data-item]').forEach((item, i) => {
    controls(item, '[name]').forEach((input) => {
      const m = NAME.exec(input.name);
      if (m) input.name = `${m[1]}__${i}__${m[2]}`;
    });
    const number = item.querySelector('[data-item-number]');
    if (number) number.textContent = String(i + 1);
  });
}

// `data-item-keep`: a value the form fills in itself (the country of a price row), not something typed.
const isEmpty = (item: HTMLElement) =>
  controls(item, '[name]:not([data-item-keep])').every((input) => input.value.trim() === '');

for (const list of document.querySelectorAll<HTMLElement>('[data-items]')) {
  const items = () => Array.from(list.querySelectorAll<HTMLElement>('[data-item]'));
  const add = list.querySelector<HTMLButtonElement>('[data-item-add]');
  if (!add) continue;

  const update = () => {
    const shown = items().filter((item) => !item.hidden);
    add.hidden = shown.length === items().length;
    // The last card cannot be removed (a list keeps one slot to type in); clearing it still empties the list.
    for (const item of items()) {
      const remove = item.querySelector<HTMLButtonElement>('[data-item-remove]');
      if (remove) remove.hidden = shown.length <= 1;
    }
  };

  // With the buttons there is no need for the spare empty slots: keep the filled ones, or one empty slot.
  const all = items();
  const lastFilled = all.reduce((last, item, i) => (isEmpty(item) ? last : i), -1);
  all.forEach((item, i) => (item.hidden = i > Math.max(lastFilled, 0)));
  const hint = list.querySelector<HTMLElement>('[data-items-hint]');
  if (hint) hint.textContent = `Up to ${all.length}. Removed cards are left out when you save.`;

  add.addEventListener('click', () => {
    const next = items().find((item) => item.hidden);
    if (!next) return;
    next.hidden = false;
    update();
    next.querySelector<HTMLElement>('[name]')?.focus();
  });

  list.addEventListener('click', (event) => {
    const remove = (event.target as Element).closest('[data-item-remove]');
    if (!remove) return;
    const item = remove.closest<HTMLElement>('[data-item]');
    if (!item) return;
    item
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input[name]:not([data-item-keep]), textarea[name]',
      )
      .forEach((input) => {
        input.value = '';
      });
    (controls(item, 'select[name]') as HTMLSelectElement[]).forEach(
      (select) => (select.selectedIndex = 0),
    );
    // Empty slots wait at the end, hidden, for "Add".
    item.hidden = true;
    list.insertBefore(item, add);
    renumber(list);
    update();
    add.focus();
  });

  update();
}

export {};
