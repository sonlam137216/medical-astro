// Search box of the article lists. The list itself is plain pages and links; only the search needs a script,
// because a page holds just some of the articles. The first time someone types, the small index of the kind
// (`search.json`: title, summary, category, section headings and the text) is fetched; matches replace the list until the
// box is empty again. Without JavaScript the box stays hidden (see ArticleIndex) and the pages still work.
interface Entry {
  title: string;
  excerpt: string;
  category: string;
  path: string;
  topics: string;
  /** The article's text (the first part of it). */
  text: string;
}

const root = document.querySelector<HTMLElement>('[data-article-index]');
const form = document.querySelector<HTMLFormElement>('[data-article-form]');
const input = document.querySelector<HTMLInputElement>('[data-article-search]');

if (root && form && input) {
  const browse = root.querySelector<HTMLElement>('[data-browse]');
  const results = root.querySelector<HTMLElement>('[data-search-results]');
  const status = root.querySelector<HTMLElement>('[data-search-status]');
  const list = root.querySelector<HTMLElement>('[data-search-list]');
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
    browse?.toggleAttribute('hidden', searching);
    results?.toggleAttribute('hidden', !searching);
  };

  const render = (matches: Entry[], failed = false) => {
    if (!list || !status) return;
    list.replaceChildren();
    status.textContent = failed
      ? 'Search is not available right now. Please try again.'
      : matches.length === 0
        ? 'No articles match your search. Try a different word.'
        : matches.length === 1
          ? '1 article found'
          : `${matches.length} articles found`;
    for (const m of matches.slice(0, 40)) {
      const item = document.createElement('li');
      if (m.category) {
        const category = document.createElement('p');
        category.className = 'result__category';
        category.textContent = m.category;
        item.appendChild(category);
      }
      const title = document.createElement('a');
      title.className = 'result__title';
      title.href = m.path;
      title.textContent = m.title;
      item.appendChild(title);
      if (m.excerpt) {
        const excerpt = document.createElement('p');
        excerpt.className = 'result__excerpt';
        excerpt.textContent = m.excerpt;
        item.appendChild(excerpt);
      }
      list.appendChild(item);
    }
  };

  let latest = 0;
  const run = async () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    const ticket = ++latest;
    if (words.length === 0) {
      show(false);
      return;
    }
    show(true);
    const entries = await load();
    if (ticket !== latest) return; // a newer keystroke is already being handled
    if (!entries) return render([], true);
    // An article that mentions every word in its title, summary, category or headings comes before one that
    // only has them somewhere in its text.
    const found = entries
      .map((e) => ({
        entry: e.entry,
        inHead: words.every((w) => e.head.includes(w)),
        inText: words.every((w) => `${e.head} ${e.text}`.includes(w)),
      }))
      .filter((e) => e.inText);
    render(
      [...found.filter((e) => e.inHead), ...found.filter((e) => !e.inHead)].map((e) => e.entry),
    );
  };

  input.addEventListener('input', run);
  input.addEventListener('focus', () => void load(), { once: true });
  form.addEventListener('submit', (event) => event.preventDefault());
}
