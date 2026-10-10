// Search box and category chips of the article lists. Everything is already in the page; this only hides
// cards. Without JavaScript the controls stay hidden (see ArticleIndex) and every article is listed.
const root = document.querySelector<HTMLElement>('[data-article-index]');

if (root) {
  const input = root.querySelector<HTMLInputElement>('[data-article-search]');
  const form = root.querySelector<HTMLFormElement>('[data-article-form]');
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-chip]')];
  const cards = [...root.querySelectorAll<HTMLElement>('[data-article]')];
  const empty = root.querySelector<HTMLElement>('[data-no-match]');
  const count = root.querySelector<HTMLElement>('[data-count]');
  let category = '';

  const apply = () => {
    const words = (input?.value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      const text = card.dataset.search ?? '';
      const match =
        (category === '' || card.dataset.category === category) &&
        words.every((w) => text.includes(w));
      card.parentElement?.toggleAttribute('hidden', !match);
      if (match) shown++;
    }
    empty?.toggleAttribute('hidden', shown > 0 || cards.length === 0);
    if (count) count.textContent = shown === 1 ? '1 article' : `${shown} articles`;
  };

  input?.addEventListener('input', apply);
  form?.addEventListener('submit', (event) => event.preventDefault());
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      category = chip.dataset.chip ?? '';
      for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
      apply();
    });
  }
}
