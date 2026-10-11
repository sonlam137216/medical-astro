// Admin-only. The "Select or upload media" window used by every photo and video field and by the article text
// editor: a Library tab (search, pages) and an Upload tab (drag and drop, description, progress). Choosing or
// uploading an item hands it to `onSelect` and closes the window. The window is added to the page body, not to
// the form being edited, so nothing in it is ever submitted with that form.
import { uploadImage, uploadVideo } from './media-client';

export interface PickedMedia {
  id: string;
  kind: 'image' | 'video';
  thumb: string | null;
  label: string;
}
interface ListedItem extends PickedMedia {
  detail: string | null;
}
interface Options {
  kind: 'image' | 'video';
  /** Marked as the current choice in the library. */
  selectedId?: string;
  onSelect: (item: PickedMedia) => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
};

// `append` is typed for the Workers runtime in this project, so children are added one by one.
const add = (parent: Node, ...children: (Node | string)[]) => {
  for (const child of children) {
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
};

async function fetchList(kind: string, query: string, page: number) {
  const params = new URLSearchParams({ kind, q: query, page: String(page) });
  const response = await fetch(`/admin/media/list?${params}`);
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as { items: ListedItem[]; more: boolean };
}

export function openMediaModal(options: Options) {
  const { kind } = options;
  const noun = kind === 'video' ? 'video' : 'image';
  const dialog = el('dialog', {
    class: 'admin-media-modal',
    'aria-labelledby': 'media-modal-title',
  });

  // ---- shell ---------------------------------------------------------------------------------------------
  const head = el('div', { class: 'admin-media-modal__head' });
  add(
    head,
    el('h2', { id: 'media-modal-title' }, `Choose ${kind === 'video' ? 'a video' : 'an image'}`),
  );
  const close = el(
    'button',
    { type: 'button', class: 'admin-media-modal__close', 'aria-label': 'Close' },
    '×',
  );
  add(head, close);

  const tabs = el('div', { class: 'admin-media-modal__tabs', role: 'tablist' });
  const libraryTab = el(
    'button',
    { type: 'button', role: 'tab', 'aria-selected': 'true' },
    'Library',
  );
  const uploadTab = el(
    'button',
    { type: 'button', role: 'tab', 'aria-selected': 'false' },
    'Upload',
  );
  add(tabs, libraryTab, uploadTab);

  // ---- library panel -------------------------------------------------------------------------------------
  const library = el('div', { class: 'admin-media-modal__panel', role: 'tabpanel' });
  const search = el('input', {
    type: 'search',
    placeholder: 'Search by description',
    'aria-label': `Search ${noun}s by description`,
    maxlength: '100',
  });
  const status = el('p', { class: 'admin-hint', role: 'status', 'aria-live': 'polite' });
  const grid = el('ul', { class: 'admin-media-modal__grid' });
  const more = el('button', { type: 'button', class: 'admin-btn admin-btn--ghost' }, 'Load more');
  more.hidden = true;
  add(library, search, status, grid, more);

  // ---- upload panel --------------------------------------------------------------------------------------
  const upload = el('div', { class: 'admin-media-modal__panel', role: 'tabpanel' });
  upload.hidden = true;
  const drop = el('label', { class: 'admin-media-modal__drop' });
  const dropText = el(
    'span',
    {},
    kind === 'video'
      ? 'Drop an MP4 video here, or click to choose one'
      : 'Drop an image here, or click to choose one',
  );
  const file = el('input', {
    type: 'file',
    accept: kind === 'video' ? 'video/mp4' : 'image/jpeg,image/png,image/webp',
    class: 'visually-hidden',
  });
  add(drop, dropText, file);

  const altLabel = el('label', {});
  add(
    altLabel,
    kind === 'video' ? 'What the video shows' : 'Description for people who cannot see the image',
  );
  const alt = el('input', {
    maxlength: '500',
    placeholder: kind === 'video' ? '' : "For example: Dentist examining a patient's teeth",
  });
  add(altLabel, alt);

  const decorativeLabel = el('label', { class: 'admin-check' });
  const decorative = el('input', { type: 'checkbox' });
  add(decorativeLabel, decorative, 'Decorative image (no description needed)');
  decorativeLabel.hidden = kind === 'video';

  const posterLabel = el('label', {});
  add(posterLabel, 'Cover image (shown before the video plays)');
  const poster = el('select', {});
  add(poster, el('option', { value: '' }, 'None: the browser shows the first frame'));
  add(posterLabel, poster);
  posterLabel.hidden = kind !== 'video';

  const progress = el('progress', { value: '0', max: '100' });
  progress.hidden = true;
  const uploadStatus = el('p', { class: 'form__status', role: 'status', 'aria-live': 'polite' });
  const go = el('button', { type: 'button', class: 'admin-btn' }, `Upload ${noun}`);
  const hint = el(
    'p',
    { class: 'admin-hint' },
    kind === 'video'
      ? 'The video is stored as it is: it is not converted, and it must be prepared for web playback (see the Media page). Do not upload recordings of patients unless they have given written permission.'
      : 'The image is resized in your browser to a few web sizes and location data is removed. Do not upload photos of patients unless they have given written permission.',
  );
  add(upload, drop, altLabel, decorativeLabel, posterLabel, go, progress, uploadStatus, hint);

  add(dialog, head, tabs, library, upload);
  // Inside the admin shell (it defines the colours) but not inside the form being edited.
  add(document.querySelector('.admin-shell') ?? document.body, dialog);

  // ---- behaviour -----------------------------------------------------------------------------------------
  const finish = (item: PickedMedia) => {
    dialog.close();
    options.onSelect(item);
  };
  const showTab = (name: 'library' | 'upload') => {
    library.hidden = name !== 'library';
    upload.hidden = name !== 'upload';
    libraryTab.setAttribute('aria-selected', String(name === 'library'));
    uploadTab.setAttribute('aria-selected', String(name === 'upload'));
    if (name === 'library') search.focus();
    else {
      void fillPosters();
      file.focus();
    }
  };
  libraryTab.addEventListener('click', () => showTab('library'));
  uploadTab.addEventListener('click', () => showTab('upload'));
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());

  // Library
  let page = 1;
  let query = '';
  let ticket = 0;
  const card = (item: ListedItem) => {
    const li = el('li');
    const button = el('button', {
      type: 'button',
      'aria-pressed': String(item.id === options.selectedId),
      title: item.label,
    });
    if (item.thumb) add(button, el('img', { src: item.thumb, alt: '', loading: 'lazy' }));
    else add(button, el('span', { class: 'admin-media-modal__novideo' }, 'Video'));
    add(button, el('span', {}, item.label));
    if (item.detail) add(button, el('small', {}, item.detail));
    button.addEventListener('click', () => finish(item));
    add(li, button);
    return li;
  };
  const load = async (reset: boolean) => {
    const mine = ++ticket;
    if (reset) {
      page = 1;
      grid.replaceChildren();
    }
    status.textContent = 'Loading…';
    try {
      const result = await fetchList(kind, query, page);
      if (mine !== ticket) return;
      for (const item of result.items) add(grid, card(item));
      more.hidden = !result.more;
      status.textContent =
        grid.children.length === 0
          ? query
            ? `No ${noun}s match this search.`
            : `No ${noun}s yet. Use the Upload tab.`
          : '';
      // An empty library: go straight to uploading, as WordPress does.
      if (grid.children.length === 0 && !query) showTab('upload');
    } catch {
      if (mine === ticket) status.textContent = `Could not load the ${noun}s. Please try again.`;
    }
  };
  more.addEventListener('click', () => {
    page += 1;
    void load(false);
  });
  let timer: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      query = search.value.trim();
      void load(true);
    }, 250);
  });

  // Upload
  let postersLoaded = false;
  async function fillPosters() {
    if (kind !== 'video' || postersLoaded) return;
    postersLoaded = true;
    try {
      const result = await fetchList('image', '', 1);
      for (const image of result.items) add(poster, el('option', { value: image.id }, image.label));
    } catch {
      postersLoaded = false;
    }
  }
  const showUpload = (message: string, error = false) => {
    uploadStatus.textContent = message;
    uploadStatus.dataset.kind = error ? 'error' : 'ok';
  };
  file.addEventListener('change', () => {
    dropText.textContent = file.files?.[0]?.name ?? dropText.textContent;
  });
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, () => drop.classList.remove('is-over'));
  }
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    const dropped = (event as DragEvent).dataTransfer?.files;
    if (dropped && dropped.length > 0) {
      file.files = dropped;
      file.dispatchEvent(new Event('change'));
    }
  });
  go.addEventListener('click', async () => {
    const chosen = file.files?.[0];
    if (!chosen)
      return showUpload(`Choose ${kind === 'video' ? 'a video' : 'an image'} first.`, true);
    go.disabled = true;
    const result =
      kind === 'video'
        ? await uploadVideo(chosen, {
            altText: alt.value,
            poster: poster.value || undefined,
            onProgress: (percent) => {
              progress.hidden = false;
              progress.value = percent;
            },
            onStatus: (message) => showUpload(message),
          })
        : await uploadImage(chosen, alt.value, decorative.checked, (message) =>
            showUpload(message),
          );
    go.disabled = false;
    progress.hidden = true;
    if (!result.ok) return showUpload(result.error, true);
    finish({ id: result.item.id, kind, thumb: result.item.thumb, label: result.item.label });
  });

  dialog.showModal();
  void load(true);
}
