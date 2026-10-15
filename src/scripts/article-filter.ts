// Search box of the article lists. The list itself is plain pages and links; only the search needs a script,
// because a page holds just some of the articles. The first time someone types, the small index of the kind
// (`search.json`: title, summary, category, section headings and the text) is fetched; matches replace the list until the
// box is empty again. On a category page the search looks in that category first, and in the whole kind when
// nothing there matches. Without JavaScript the box stays hidden (see ArticleIndex) and the pages still work.
interface Entry {
  title: string;
  excerpt: string;
  category: string;
  categorySlug?: string;
  path: string;
  topics: string;
  /** The article's text (the first part of it). */
  text: string;
}

const root = document.querySelector<HTMLElement>('[data-article-index]');
const form = document.querySelector<HTMLFormElement>('[data-article-form]');
const input = document.querySelector<HTMLInputElement>('[data-article-search]');
const chips = document.querySelector<HTMLElement>('[data-chips]');

// On a narrow screen the chips scroll sideways: bring the current one into view.
const currentChip = chips?.querySelector<HTMLElement>('[aria-current]');
if (chips && currentChip && chips.scrollWidth > chips.clientWidth) {
  const offset = currentChip.getBoundingClientRect().left - chips.getBoundingClientRect().left;
  chips.scrollLeft += offset - (chips.clientWidth - currentChip.offsetWidth) / 2;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Appends `text` to `el`, with the searched words wrapped in <mark> (text nodes only, never HTML). */
function appendMarked(el: HTMLElement, text: string, words: string[]) {
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  text.split(pattern).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const mark = document.createElement('mark');
      mark.textContent = part;
      el.appendChild(mark);
    } else el.appendChild(document.createTextNode(part));
  });
}

/** The summary when it holds a searched word, otherwise the piece of the text around the first match. */
function snippet(entry: Entry, words: string[]): string {
  const excerpt = entry.excerpt.toLowerCase();
  if (!entry.text || words.some((w) => excerpt.includes(w))) return entry.excerpt;
  const text = entry.text.toLowerCase();
  const at = Math.min(...words.map((w) => text.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return entry.excerpt;
  const start = Math.max(0, entry.text.lastIndexOf(' ', Math.max(0, at - 60)) + 1);
  const endSpace = entry.text.indexOf(' ', at + 120);
  const end = endSpace === -1 ? entry.text.length : endSpace;
  return `${start > 0 ? '…' : ''}${entry.text.slice(start, end).trim()}${end < entry.text.length ? '…' : ''}`;
}

if (root && form && input) {
  const browse = root.querySelector<HTMLElement>('[data-browse]');
  const results = root.querySelector<HTMLElement>('[data-search-results]');
  const status = root.querySelector<HTMLElement>('[data-search-status]');
  const list = root.querySelector<HTMLElement>('[data-search-list]');
  const toolbar = form.closest<HTMLElement>('.toolbar');
  const { category, categoryName, listName = 'this guide' } = form.dataset;
  // `head` is what an article is about (title, summary, category, headings), `text` its body.
  let index: Promise<{ entry: Entry; head: string; text: string }[] | null> | undefined;

  const load = () =>
    (index ??= fetch(form.dataset.searchUrl ?? '')
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ articles: Entry[] }>)
          : Promise.reject(new Error(String(r.status))),
      )
      .then((data) =>
        data.articles.map((entry) => ({
          entry,
          head: [entry.title, entry.excerpt, entry.category, entry.topics].join(' ').toLowerCase(),
          text: (entry.text ?? '').toLowerCase(),
        })),
      )
      .catch(() => {
        index = undefined; // try again on the next keystroke
        return null;
      }));

  const show = (searching: boolean) => {
    const wasSearching = results ? !results.hidden : false;
    browse?.toggleAttribute('hidden', searching);
    results?.toggleAttribute('hidden', !searching);
    // Starting a search far down the list: bring the results up under the bar.
    if (searching && !wasSearching) {
      const below = toolbar ? toolbar.getBoundingClientRect().bottom : 0;
      const top = root.getBoundingClientRect().top;
      if (top < below) window.scrollBy({ top: top - below - 16, behavior: 'instant' });
    }
  };

  /** Status line: parts in a <b> are the number of articles. */
  const setStatus = (...parts: (string | { strong: string })[]) => {
    if (!status) return;
    status.replaceChildren(
      ...parts.map((p) => {
        if (typeof p === 'string') return document.createTextNode(p);
        const b = document.createElement('b');
        b.textContent = p.strong;
        return b;
      }),
    );
  };

  const count = (n: number) => ({ strong: n === 1 ? '1 article' : `${n} articles` });

  const render = (matches: Entry[], words: string[]) => {
    if (!list) return;
    list.replaceChildren();
    for (const m of matches.slice(0, 40)) {
      const item = document.createElement('li');
      if (m.category) {
        const cat = document.createElement('p');
        cat.className = 'result__category';
        cat.textContent = m.category;
        item.appendChild(cat);
      }
      const title = document.createElement('a');
      title.className = 'result__title';
      title.href = m.path;
      appendMarked(title, m.title, words);
      item.appendChild(title);
      const text = snippet(m, words);
      if (text) {
        const excerpt = document.createElement('p');
        excerpt.className = 'result__excerpt';
        appendMarked(excerpt, text, words);
        item.appendChild(excerpt);
      }
      list.appendChild(item);
    }
  };

  let latest = 0;
  const run = async () => {
    const query = input.value.trim();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const ticket = ++latest;
    if (words.length === 0) {
      show(false);
      return;
    }
    show(true);
    const entries = await load();
    if (ticket !== latest) return; // a newer keystroke is already being handled
    if (!entries) {
      render([], words);
      return setStatus('Search is not available right now. Please try again.');
    }
    // An article that mentions every word in its title, summary, category or headings comes before one that
    // only has them somewhere in its text.
    const found = entries
      .map((e) => ({
        entry: e.entry,
        inHead: words.every((w) => e.head.includes(w)),
        inText: words.every((w) => `${e.head} ${e.text}`.includes(w)),
      }))
      .filter((e) => e.inText);
    const all = [...found.filter((e) => e.inHead), ...found.filter((e) => !e.inHead)].map(
      (e) => e.entry,
    );
    const quoted = `“${query}”`;
    if (category) {
      const here = all.filter((e) => e.categorySlug === category);
      if (here.length > 0) {
        render(here, words);
        return setStatus(count(here.length), ` in ${categoryName} match ${quoted}`);
      }
      if (all.length > 0) {
        render(all, words);
        return setStatus(
          `Nothing in ${categoryName} matches ${quoted}. `,
          count(all.length),
          ` in ${listName} do:`,
        );
      }
    }
    render(all, words);
    if (all.length === 0) setStatus(`No articles match ${quoted}. Try a different word.`);
    else setStatus(count(all.length), ` match ${quoted}`);
  };

  input.addEventListener('input', run);
  input.addEventListener('focus', () => void load(), { once: true });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      input.value = '';
      void run();
    }
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  // "/" jumps to the search box, as on many sites, unless someone is already typing somewhere.
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    input.focus();
  });
}
