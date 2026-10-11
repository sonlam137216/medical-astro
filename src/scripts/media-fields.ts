// Admin-only. Turns the photo fields (a radio list) and the video field (a drop-down) into "choose or upload"
// fields that open the media window (media-modal.ts). The radios and the drop-down stay the real form controls:
// this script only checks, adds and selects entries in them, so saving works exactly as without JavaScript.
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
for (const field of document.querySelectorAll<HTMLElement>('[data-media-field]')) {
  const box = field.querySelector<HTMLElement>('[data-media-chosen]');
  const fallback = field.querySelector<HTMLElement>('[data-media-fallback]');
  const radios = () => [...field.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  if (!box || !fallback || radios().length === 0) continue;

  const name = radios()[0].name;
  const label = (radio: HTMLInputElement) => radio.closest('label');

  const render = () => {
    const checked = radios().find((r) => r.checked);
    box.replaceChildren();
    const picture = checked?.value ? label(checked)?.querySelector('img') : null;
    const buttons = el('div', 'admin-media-chosen__buttons');

    if (checked?.value && picture) {
      const thumb = el('img');
      thumb.src = picture.src;
      thumb.alt = '';
      add(box, thumb);
      add(box, el('span', 'admin-media-chosen__label', label(checked)?.textContent?.trim() ?? ''));
    } else {
      add(box, el('span', 'admin-media-chosen__label', 'Nothing chosen'));
    }
    const choose = el(
      'button',
      'admin-btn admin-btn--ghost',
      checked?.value ? 'Replace' : 'Choose',
    );
    choose.type = 'button';
    choose.addEventListener('click', () =>
      openMediaModal({ kind: 'image', selectedId: checked?.value, onSelect: select }),
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
    add(box, buttons);
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
