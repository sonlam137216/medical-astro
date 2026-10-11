// Admin-only. Turns the photo fields (a radio list) and the video field (a drop-down) into "choose or upload"
// fields that open the media window (media-modal.ts). The radios and the drop-down stay the real form controls:
// this script only checks, adds and selects entries in them, so saving works exactly as without JavaScript.
import { fitWarnings, frameAspect, IMAGE_SLOTS, isSlotKey, toFocus } from '../lib/image-slots';
import { openMediaModal, type PickedMedia } from './media-modal';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
// `append` is typed for the Workers runtime in this project, so children are added one by one.
const add = (parent: Node, ...children: Node[]) => {
  for (const child of children) parent.appendChild(child);
};

// ---- photos --------------------------------------------------------------------------------------------
const readFocus = (radio: HTMLInputElement) => {
  const x = Number(radio.dataset.focusX ?? '');
  const y = Number(radio.dataset.focusY ?? '');
  return radio.dataset.focusX !== undefined && radio.dataset.focusY !== undefined
    ? toFocus(x, y)
    : null;
};
const readSize = (radio: HTMLInputElement) => {
  const width = Number(radio.dataset.width ?? '');
  const height = Number(radio.dataset.height ?? '');
  return width > 0 && height > 0 ? { width, height } : null;
};

for (const field of document.querySelectorAll<HTMLElement>('[data-media-field]')) {
  const box = field.querySelector<HTMLElement>('[data-media-chosen]');
  const fallback = field.querySelector<HTMLElement>('[data-media-fallback]');
  const radios = () => [...field.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  if (!box || !fallback || radios().length === 0) continue;

  const name = radios()[0].name;
  const label = (radio: HTMLInputElement) => radio.closest('label');
  const slotKey = field.dataset.slot;
  const slot = isSlotKey(slotKey) ? IMAGE_SLOTS[slotKey] : null;

  // A message to show after the next redraw (the preview is rebuilt whenever the focus point changes).
  let flash: string | null = null;

  // How the picture will look in each place that shows it, the advice about its size, and the focus picker.
  const renderPreview = (radio: HTMLInputElement, source: string) => {
    if (!slot) return null;
    const size = readSize(radio);
    const focus = readFocus(radio);
    const wrap = el('div', 'admin-slot');

    const frames = el('div', 'admin-slot__frames');
    slot.frames.forEach((frame, index) => {
      const figure = el('figure', 'admin-slot__frame');
      const crop = el('div', 'admin-slot__crop');
      crop.style.aspectRatio = frameAspect(slot, index);
      const img = el('img');
      img.src = source;
      img.alt = '';
      const point = focus ?? slot.position;
      img.style.objectPosition = `${point.x}% ${point.y}%`;
      add(crop, img);
      add(figure, crop, el('figcaption', undefined, frame.label));
      add(frames, figure);
    });
    add(wrap, frames);

    if (size) {
      for (const warning of fitWarnings(slot, size)) {
        const note = el('p', 'admin-field-warning', warning);
        note.setAttribute('role', 'status');
        add(wrap, note);
      }
    }

    // The whole picture with a marker: click the part that must stay in view when the picture is cropped.
    const id = radio.value;
    const picker = el('details', 'admin-slot__focus');
    add(picker, el('summary', undefined, 'Choose what stays in view'));
    const hint = el(
      'p',
      'admin-hint',
      'Click the most important part (a face, a tooth). It is kept in view when the picture is cropped. This applies wherever this picture is used, after you publish.',
    );
    const stage = el('button', 'admin-focus');
    stage.type = 'button';
    stage.setAttribute('aria-label', 'Click the most important part of the picture');
    const full = el('img');
    full.src = source;
    full.alt = '';
    const marker = el('span', 'admin-focus__marker');
    const place = (point: { x: number; y: number } | null) => {
      marker.hidden = point === null;
      if (point) {
        marker.style.left = `${point.x}%`;
        marker.style.top = `${point.y}%`;
      }
    };
    place(focus);
    add(stage, full, marker);
    const status = el('p', 'admin-hint');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const reset = el('button', 'admin-btn admin-btn--ghost', 'Use the default position');
    reset.type = 'button';
    reset.hidden = focus === null;

    const save = async (body: URLSearchParams, next: { x: number; y: number } | null) => {
      status.textContent = 'Saving…';
      try {
        const response = await fetch(`/admin/media/${id}/focus`, {
          method: 'POST',
          headers: { accept: 'application/json' },
          body,
        });
        if (!response.ok) throw new Error(String(response.status));
      } catch {
        status.textContent = 'Could not save. Please try again.';
        return;
      }
      if (next) {
        radio.dataset.focusX = String(next.x);
        radio.dataset.focusY = String(next.y);
      } else {
        delete radio.dataset.focusX;
        delete radio.dataset.focusY;
      }
      flash = 'Saved. Publish to show it on the website.';
      render();
    };
    stage.addEventListener('click', (event) => {
      const rect = full.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
      const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
      const point = toFocus(Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
      if (point) void save(new URLSearchParams({ x: String(point.x), y: String(point.y) }), point);
    });
    reset.addEventListener('click', () => void save(new URLSearchParams({ clear: '1' }), null));
    if (flash) {
      status.textContent = flash;
      picker.open = true;
      flash = null;
    }
    add(picker, hint, stage, reset, status);
    add(wrap, picker);
    return wrap;
  };

  const render = () => {
    const checked = radios().find((r) => r.checked);
    box.replaceChildren();
    const picture = checked?.value ? label(checked)?.querySelector('img') : null;
    const head = el('div', 'admin-media-chosen__head');
    const buttons = el('div', 'admin-media-chosen__buttons');

    if (checked?.value && picture) {
      const thumb = el('img');
      thumb.src = picture.src;
      thumb.alt = '';
      add(head, thumb);
      add(head, el('span', 'admin-media-chosen__label', label(checked)?.textContent?.trim() ?? ''));
    } else {
      add(head, el('span', 'admin-media-chosen__label', 'Nothing chosen'));
    }
    const choose = el(
      'button',
      'admin-btn admin-btn--ghost',
      checked?.value ? 'Replace' : 'Choose',
    );
    choose.type = 'button';
    choose.addEventListener('click', () =>
      openMediaModal({
        kind: 'image',
        selectedId: checked?.value,
        slot: slotKey && isSlotKey(slotKey) ? slotKey : undefined,
        onSelect: select,
      }),
    );
    add(buttons, choose);
    if (checked?.value) {
      const remove = el('button', 'admin-btn admin-btn--ghost', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        const none = radios().find((r) => r.value === '');
        if (none) none.checked = true;
        render();
      });
      add(buttons, remove);
    }
    add(head, buttons);
    add(box, head);
    if (checked?.value && picture) {
      const preview = renderPreview(checked, picture.src);
      if (preview) add(box, preview);
    }
  };

  const select = (item: PickedMedia) => {
    let radio = radios().find((r) => r.value === item.id);
    if (!radio) {
      // A new upload, or an item beyond the first list: add it to the real controls.
      const wrapper = el('label');
      radio = el('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = item.id;
      add(wrapper, radio);
      if (item.thumb) {
        const img = el('img');
        img.src = item.thumb;
        img.alt = '';
        add(wrapper, img);
      }
      add(wrapper, el('span', undefined, item.label));
      add(fallback, wrapper);
    }
    if (item.width && item.height) {
      radio.dataset.width = String(item.width);
      radio.dataset.height = String(item.height);
    }
    if (item.focus) {
      radio.dataset.focusX = String(item.focus.x);
      radio.dataset.focusY = String(item.focus.y);
    }
    radio.checked = true;
    render();
  };

  fallback.hidden = true;
  box.hidden = false;
  render();
}

// ---- video ---------------------------------------------------------------------------------------------
const videoPickers = [
  ...document.querySelectorAll<HTMLElement>('select[data-media-video]'),
] as unknown as HTMLSelectElement[];
for (const picker of videoPickers) {
  const button = el('button', 'admin-btn admin-btn--ghost', 'Choose or upload a video…');
  button.type = 'button';
  button.addEventListener('click', () =>
    openMediaModal({
      kind: 'video',
      selectedId: picker.value,
      onSelect: (item) => {
        if (![...picker.options].some((o) => o.value === item.id)) {
          const option = el('option', undefined, item.label);
          option.value = item.id;
          add(picker, option);
        }
        picker.value = item.id;
      },
    }),
  );
  picker.insertAdjacentElement('afterend', button);
}
