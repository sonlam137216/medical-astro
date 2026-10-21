// Admin-only. The cost tables of Page text ("Home: treatment costs table", "Dental Implants: cost comparison"):
// the countries are a list of boxes, and every treatment has a row of price boxes per country (Field.astro).
// This keeps the rows in step with the list while the admin types: a country added gets its row in every
// treatment, a renamed one keeps its prices (rows follow the box, not the name), a moved one moves, and a removed
// one takes its prices away after a confirmation (they come back if the country is added again before saving).
// It also fills the "compared when the page opens" list and offers each saving worked out from the prices.
// Without JavaScript the form still works: the rows are those of the saved countries ("save, and its boxes appear").
import { sameCountry, suggestedSaving } from '../lib/cms/cost-table';

// The Workers types declare their own `Element`, so inputs are cast like the other admin scripts.
type Input = HTMLInputElement;
const inputs = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll(selector)) as unknown as Input[];
const input = (root: HTMLElement, selector: string) =>
  root.querySelector(selector) as unknown as Input | null;

interface Country {
  key: string;
  name: string;
}
type Saved = { price: string; detail: string; saving: string };

let nextKey = 0;
const newKey = () => `c${nextKey++}`;

for (const box of document.querySelectorAll<HTMLElement>('[data-countries-list]')) {
  const form = box.closest('form');
  const list = box.querySelector<HTMLElement>('[data-list-items]');
  const add = box.querySelector<HTMLButtonElement>('[data-list-add]');
  if (!form || !list || !add) continue;
  const addButton: HTMLButtonElement = add;
  const field = box.dataset.countriesList ?? '';
  const max = Number(box.dataset.max) || 8;
  const grids = Array.from(form.querySelectorAll<HTMLElement>('[data-cost-prices]'));
  const compare = form.querySelector(`select[data-choices-from="${field}"]`) as unknown as
    HTMLSelectElement | undefined;
  const compareEmpty = compare?.options[0]?.textContent?.trim() ?? '';
  // Prices of a removed country, by name, in each treatment: restored if the country is added back.
  const removed = new Map<HTMLElement, Map<string, Saved>>(grids.map((g) => [g, new Map()]));

  const items = () => Array.from(list.querySelectorAll<HTMLElement>('[data-list-item]'));
  const countries = (): Country[] =>
    items().map((li) => ({
      key: li.dataset.key ?? '',
      name: input(li, 'input')?.value.trim() ?? '',
    }));

  // ---- Start: keys for the boxes, the price rows and the compare choices ----------------------------------
  const filled = items().filter((li) => input(li, 'input')?.value.trim());
  for (const li of items()) {
    li.dataset.key = newKey();
    // The spare empty boxes are for the form without JavaScript; "Add country" replaces them.
    if (filled.length > 0 && !filled.includes(li)) li.remove();
  }
  const claim = (rows: HTMLElement[], name: string) => {
    for (const c of countries())
      if (sameCountry(c.name, name) && !rows.some((r) => r.dataset.key === c.key)) return c.key;
    return '';
  };
  for (const grid of grids) {
    const rows = Array.from(grid.querySelectorAll<HTMLElement>('[data-price-row]'));
    const keyed: HTMLElement[] = [];
    for (const row of rows) {
      row.dataset.key = claim(keyed, input(row, '[data-item-keep]')?.value ?? '');
      keyed.push(row);
    }
    grid.querySelector<HTMLElement>('[data-prices-nojs]')?.remove();
  }
  if (compare) {
    for (const option of Array.from(compare.options)) {
      const c = countries().find((c) => option.value && sameCountry(c.name, option.value));
      if (c) option.dataset.key = c.key;
    }
  }

  // ---- Price rows ----------------------------------------------------------------------------------------
  const cell = (child: HTMLElement) => {
    const td = document.createElement('td');
    td.appendChild(child);
    return td;
  };
  const textBox = (part: string, maxLength: number, placeholder: string) => {
    const el = document.createElement('input');
    el.dataset.part = part;
    el.maxLength = maxLength;
    el.placeholder = placeholder;
    return el;
  };

  function makeRow(c: Country): HTMLElement {
    const row = document.createElement('tr');
    row.dataset.priceRow = '';
    row.dataset.key = c.key;
    const th = document.createElement('th');
    th.scope = 'row';
    const label = document.createElement('span');
    label.dataset.priceCountry = '';
    const country = document.createElement('input');
    country.type = 'hidden';
    country.dataset.itemKeep = '';
    country.dataset.part = 'country';
    th.appendChild(label);
    th.appendChild(country);
    const price = textBox('price', 40, 'US$1,250');
    price.dataset.price = '';
    const detail = textBox('detail', 60, '40 clinics');
    const none = document.createElement('span');
    none.className = 'admin-prices__none';
    none.dataset.savingNone = '';
    none.textContent = 'No saving (base price)';
    const saving = textBox('saving', 40, '');
    saving.dataset.saving = '';
    const savingCell = cell(none);
    savingCell.appendChild(saving);
    for (const child of [th, cell(price), cell(detail), savingCell]) row.appendChild(child);
    return row;
  }

  const partOf = (el: Input) =>
    el.dataset.part ?? /__(country|price|detail|saving)$/.exec(el.name)?.[1] ?? '';
  const savedOf = (row: HTMLElement): Saved => {
    const v = (part: string) =>
      inputs(row, 'input')
        .find((el) => partOf(el) === part)
        ?.value.trim() ?? '';
    return { price: v('price'), detail: v('detail'), saving: v('saving') };
  };
  const hasPrices = (row: HTMLElement) => Object.values(savedOf(row)).some((v) => v !== '');

  // The name of each box: `<treatment>__<column>__<row>__<part>`, the treatment taken from its other boxes.
  function prefixOf(grid: HTMLElement): string {
    const item = grid.closest<HTMLElement>('[data-item]') ?? grid;
    const other = inputs(item, '[name]').find((el) => !grid.contains(el as unknown as Node));
    const m = other ? /^(.+?__\d+)__/.exec(other.name) : null;
    return m ? `${m[1]}__${grid.dataset.column ?? 'prices'}` : '';
  }

  function suggest(grid: HTMLElement) {
    const rows = Array.from(grid.querySelectorAll<HTMLElement>('[data-price-row]')).filter(
      (r) => !r.hidden,
    );
    const first = rows[0] ? savedOf(rows[0]).price : '';
    let offer = false;
    rows.forEach((row, j) => {
      const saving = input(row, '[data-saving]');
      if (!saving) return;
      const hint = j > 0 ? suggestedSaving(first, savedOf(row).price) : '';
      saving.dataset.suggested = hint;
      saving.placeholder = hint;
      saving.title = hint ? `Suggested from the prices: ${hint}` : '';
      if (hint && !saving.disabled && saving.value.trim() === '') offer = true;
    });
    const fill = grid.querySelector<HTMLButtonElement>('[data-fill-savings]');
    if (fill) fill.hidden = !offer;
  }

  function syncGrid(grid: HTMLElement, list: Country[]) {
    const body = grid.querySelector<HTMLElement>('[data-price-rows]');
    if (!body) return;
    const rows = new Map(
      Array.from(body.querySelectorAll<HTMLElement>('[data-price-row]')).map((r) => [
        r.dataset.key ?? '',
        r,
      ]),
    );
    const prefix = prefixOf(grid);
    const firstKey = list.find((c) => c.name)?.key;
    list.forEach((c, j) => {
      const row = rows.get(c.key) ?? makeRow(c);
      rows.delete(c.key);
      body.appendChild(row);
      // A box being retyped keeps its row (hidden while empty), so its prices are not lost.
      row.hidden = c.name === '';
      // A country removed and added again (same name) before saving gets its prices back.
      const back = c.name ? removed.get(grid)?.get(c.name.toLocaleLowerCase('en')) : undefined;
      if (back && !hasPrices(row)) {
        for (const el of inputs(row, 'input')) {
          const part = partOf(el);
          if (part === 'price' || part === 'detail' || part === 'saving') el.value = back[part];
        }
        removed.get(grid)?.delete(c.name.toLocaleLowerCase('en'));
      }
      const label = row.querySelector('[data-price-country]');
      if (label) label.textContent = c.name;
      for (const el of inputs(row, 'input')) {
        const part = partOf(el);
        if (prefix) el.name = `${prefix}__${j}__${part}`;
        if (part === 'country') el.value = c.name;
        else
          el.setAttribute(
            'aria-label',
            `${c.name}: ${part === 'detail' ? 'under the price' : part}`,
          );
      }
      // The first country is the one the others are compared with: it has no saving.
      const first = c.key === firstKey;
      const saving = input(row, '[data-saving]');
      if (saving) {
        saving.hidden = first;
        saving.disabled = first;
      }
      const none = row.querySelector<HTMLElement>('[data-saving-none]');
      if (none) none.hidden = !first;
    });
    for (const row of rows.values()) row.remove();
    suggest(grid);
  }

  // ---- The compare list ----------------------------------------------------------------------------------
  function syncCompare(list: Country[]) {
    if (!compare) return;
    const chosen = compare.selectedOptions[0];
    const chosenKey = chosen?.dataset.key;
    const stray = chosen && chosen.value && !chosenKey ? chosen : null; // a saved name not in the list
    const named = list.filter((c) => c.name);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = named[1] ? `${compareEmpty} (${named[1].name})` : compareEmpty;
    const options = [empty];
    for (const c of named.slice(1)) {
      const option = document.createElement('option');
      option.value = c.name;
      option.textContent = c.name;
      option.dataset.key = c.key;
      option.selected = c.key === chosenKey;
      options.push(option);
    }
    if (stray) options.push(stray);
    compare.replaceChildren();
    for (const option of options) compare.appendChild(option);
    if (!compare.selectedOptions[0] || compare.selectedOptions[0].value === '') {
      if (!stray) empty.selected = true;
    }
  }

  // ---- The countries list --------------------------------------------------------------------------------
  function sync() {
    const list = countries();
    items().forEach((li, n) => {
      const el = input(li, 'input');
      if (el) el.setAttribute('aria-label', `Country ${n + 1}`);
      // The first country stays first (Vietnam, Melatec's prices); the others can move and be removed.
      const show = (selector: string, on: boolean) => {
        const button = li.querySelector<HTMLButtonElement>(selector);
        if (button) button.hidden = !on;
      };
      show('[data-list-up]', n > 1);
      show('[data-list-down]', n > 0 && n < list.length - 1);
      show('[data-list-remove]', n > 0);
    });
    addButton.hidden = list.length >= max;
    for (const grid of grids) syncGrid(grid, list);
    syncCompare(list);
  }

  add.hidden = false;
  add.addEventListener('click', () => {
    const template = items()[0];
    if (!template) return;
    const li = template.cloneNode(true) as HTMLElement;
    li.dataset.key = newKey();
    const el = input(li, 'input');
    if (el) {
      el.value = '';
      el.removeAttribute('aria-invalid');
    }
    list.appendChild(li);
    sync();
    el?.focus();
  });

  list.addEventListener('input', sync);

  list.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const li = target.closest<HTMLElement>('[data-list-item]');
    if (!li) return;
    if (target.closest('[data-list-up]')) {
      if (li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      sync();
      li.querySelector<HTMLButtonElement>('[data-list-up]:not([hidden])')?.focus();
    } else if (target.closest('[data-list-down]')) {
      if (li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      sync();
      li.querySelector<HTMLButtonElement>('[data-list-down]:not([hidden])')?.focus();
    } else if (target.closest('[data-list-remove]')) {
      const name = input(li, 'input')?.value.trim() ?? '';
      const rows = grids
        .map((grid) => ({
          grid,
          row: grid.querySelector<HTMLElement>(`[data-key="${li.dataset.key}"]`),
        }))
        .filter((x): x is { grid: HTMLElement; row: HTMLElement } => x.row !== null);
      const used = rows.filter((x) => hasPrices(x.row)).length;
      if (
        used > 0 &&
        !window.confirm(
          `Remove “${name}”? Its prices in ${used} treatment${used === 1 ? '' : 's'} will be removed when you save.`,
        )
      )
        return;
      if (name) {
        for (const { grid, row } of rows)
          if (hasPrices(row)) removed.get(grid)?.set(name.toLocaleLowerCase('en'), savedOf(row));
      }
      li.remove();
      sync();
      add.focus();
    }
  });

  // Savings: suggestions follow the prices, and one button fills the empty ones.
  for (const grid of grids) {
    grid.addEventListener('input', (event) => {
      if ((event.target as HTMLElement).matches('[data-price], [data-saving]')) suggest(grid);
    });
    grid.querySelector('[data-fill-savings]')?.addEventListener('click', () => {
      for (const saving of inputs(grid, '[data-saving]'))
        if (!saving.disabled && saving.value.trim() === '' && saving.dataset.suggested)
          saving.value = saving.dataset.suggested;
      suggest(grid);
    });
  }

  sync();
}

export {};
