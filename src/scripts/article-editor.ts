// Writing tools of the article text box in the admin: a toolbar that types the markers for you, a picture picker
// that reads from the Media library, and a preview that shows the text the way the parser will read it. The
// text stays plain text in an ordinary <textarea>, so the form works the same without this script.
import { parseArticleBody, type Block, type Inline } from '../lib/cms/articles';

const root = document.querySelector<HTMLElement>('[data-article-editor]');
const area = root?.querySelector<HTMLTextAreaElement>('[data-rte-text]');
const bar = root?.querySelector<HTMLElement>('[data-rte-tools]');
const preview = root?.querySelector<HTMLElement>('[data-rte-preview]');
const dialog = root?.querySelector<HTMLDialogElement>('[data-rte-pictures]');

if (root && area && bar && preview && dialog) {
  bar.hidden = false;
  const thumbs = new Map<string, string>();
  for (const b of dialog.querySelectorAll<HTMLElement>('[data-picture]')) {
    thumbs.set(b.dataset.picture ?? '', b.dataset.thumb ?? '');
  }

  // ---- editing helpers -----------------------------------------------------------------------------------
  const replace = (
    from: number,
    to: number,
    text: string,
    selectFrom = from,
    selectTo = from + text.length,
  ) => {
    area.focus();
    area.setRangeText(text, from, to, 'preserve');
    area.setSelectionRange(selectFrom, selectTo);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /** The lines touched by the selection, as [start, end) offsets. */
  const lineRange = () => {
    const text = area.value;
    const start = text.lastIndexOf('\n', area.selectionStart - 1) + 1;
    let end = text.indexOf('\n', area.selectionEnd);
    if (end === -1) end = text.length;
    return [start, end] as const;
  };

  const MARKS = /^(#{1,3} |[-*] |\d+[.)] |> )/;
  /** Puts a marker in front of every filled line of the selection; if they all have it already, takes it off. */
  const prefixLines = (marker: (n: number) => string, has: RegExp) => {
    const [start, end] = lineRange();
    const lines = area.value.slice(start, end).split('\n');
    const filled = lines.filter((l) => l.trim() !== '');
    const off = filled.length > 0 && filled.every((l) => has.test(l));
    let n = 0;
    const next = lines
      .map((line) => {
        if (line.trim() === '') return line;
        const bare = line.replace(MARKS, '');
        return off ? bare : marker(n++) + bare;
      })
      .join('\n');
    replace(start, end, next, start, start + next.length);
  };

  const wrap = (before: string, after: string, placeholder: string) => {
    const { selectionStart: s, selectionEnd: e } = area;
    const chosen = area.value.slice(s, e) || placeholder;
    replace(s, e, before + chosen + after, s + before.length, s + before.length + chosen.length);
  };

  const insertLink = () => {
    const { selectionStart: s, selectionEnd: e } = area;
    const words = area.value.slice(s, e) || 'link text';
    const text = `[${words}](https://)`;
    const urlFrom = s + words.length + 3;
    replace(s, e, text, urlFrom, urlFrom + 'https://'.length);
  };

  // Where the cursor was when the Picture button was pressed (the dialog takes the focus away).
  let pictureAt = 0;
  const insertPicture = (id: string) => {
    const at = Math.min(pictureAt, area.value.length);
    const before = area.value.slice(0, at);
    const lead =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const text = `${lead}![](media:${id})\n\n`;
    // Put the cursor between the brackets so a caption can be typed straight away.
    const caret = at + lead.length + 2;
    replace(at, at, text, caret, caret);
  };

  const tools: Record<string, () => void> = {
    h2: () => prefixLines(() => '## ', /^## /),
    h3: () => prefixLines(() => '### ', /^### /),
    ul: () => prefixLines(() => '- ', /^[-*] /),
    ol: () => prefixLines((n) => `${n + 1}. `, /^\d+[.)] /),
    quote: () => prefixLines(() => '> ', /^> /),
    bold: () => wrap('**', '**', 'bold text'),
    link: insertLink,
    image: () => {
      pictureAt = area.selectionEnd;
      dialog.showModal();
    },
  };

  bar.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool]');
    if (button) tools[button.dataset.tool ?? '']?.();
  });

  dialog.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-rte-cancel]')) return dialog.close();
    const pick = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-picture]');
    if (!pick) return;
    dialog.close();
    insertPicture(pick.dataset.picture ?? '');
  });

  // ---- preview -------------------------------------------------------------------------------------------
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const inline = (parent: HTMLElement, parts: Inline[]) => {
    for (const part of parts) {
      if (part.href) {
        const a = el('a', part.text);
        a.href = part.href; // the parser only lets safe targets through
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        parent.appendChild(a);
      } else if (part.bold) parent.appendChild(el('strong', part.text));
      else parent.appendChild(document.createTextNode(part.text));
    }
  };
  const block = (b: Block): HTMLElement => {
    if (b.type === 'heading') return el(b.level === 2 ? 'h2' : 'h3', b.text);
    if (b.type === 'image') {
      const figure = el('figure');
      const src = thumbs.get(b.id);
      if (src) {
        const img = el('img');
        img.src = src;
        img.alt = '';
        figure.appendChild(img);
      } else figure.appendChild(el('p', 'This picture is not in Media any more.'));
      if (b.caption) figure.appendChild(el('figcaption', b.caption));
      return figure;
    }
    if (b.type === 'list') {
      const list = el(b.ordered ? 'ol' : 'ul');
      for (const item of b.items) {
        const li = el('li');
        inline(li, item);
        list.appendChild(li);
      }
      return list;
    }
    const node = el(b.type === 'quote' ? 'blockquote' : 'p');
    inline(node, b.children);
    return node;
  };

  const show = (view: 'write' | 'preview') => {
    const previewing = view === 'preview';
    if (previewing) {
      const blocks = parseArticleBody(area.value);
      preview.replaceChildren(
        ...(blocks.length > 0 ? blocks.map(block) : [el('p', 'Nothing to preview yet.')]),
      );
    }
    area.hidden = previewing;
    preview.hidden = !previewing;
    for (const tool of bar.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      tool.disabled = previewing;
    }
    for (const tab of bar.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.view === view));
    }
  };
  for (const tab of bar.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    tab.addEventListener('click', () => show(tab.dataset.view === 'preview' ? 'preview' : 'write'));
  }
}
