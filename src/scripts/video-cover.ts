// Admin-only. What the editor sees after choosing a video file, in both upload forms (the Media page and the
// picker window): advice about the file (size, weight), a preview with a slider to pick the frame that becomes
// the cover image, and the step that turns that frame into a library image before the video is uploaded.
// Everything is read in the browser; the server re-checks whatever is sent.
import { videoWarnings } from '../lib/video-advice';
import { isDuplicate, uploadImage } from './media-client';

/** Value of the "cover image" drop-down that means "take a frame of this video". */
export const FRAME_OPTION = '__frame';

export type PosterResult = { ok: true; posterId?: string } | { ok: false; error: string };

export interface VideoCover {
  /** The id of the cover image to send with the video: the chosen library image, or the picked frame uploaded now. */
  resolvePoster(altText: string, onStatus?: (message: string) => void): Promise<PosterResult>;
  destroy(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const once = (target: EventTarget, type: string, ms: number) =>
  new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(false), ms);
    target.addEventListener(
      type,
      () => {
        window.clearTimeout(timer);
        resolve(true);
      },
      { once: true },
    );
  });

export function setupVideoCover(
  file: File,
  host: HTMLElement,
  select: HTMLSelectElement,
): VideoCover {
  host.replaceChildren();
  const url = URL.createObjectURL(file);
  const video = el('video', 'admin-cover__video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  const option = el('option', undefined, 'A frame from the video (choose it below)');
  option.value = FRAME_OPTION;

  let ready = false;
  const picker = el('div', 'admin-cover__picker');
  const label = el('p', 'admin-hint');
  const slider = el('input');
  slider.type = 'range';
  slider.min = '0';
  slider.step = '0.1';
  slider.setAttribute('aria-label', 'Choose the frame for the cover image');
  picker.hidden = true;

  const showPicker = () => {
    picker.hidden = !(ready && select.value === FRAME_OPTION);
  };
  select.addEventListener('change', showPicker);

  const seekTo = async (seconds: number) => {
    const done = once(video, 'seeked', 3000);
    video.currentTime = seconds;
    await done;
    label.textContent = `Cover frame: ${seconds.toFixed(1)} s of ${video.duration.toFixed(1)} s`;
  };
  slider.addEventListener('input', () => void seekTo(Number(slider.value)));

  void (async () => {
    // A file the browser cannot read never reports back: do not wait for it for ever.
    const loaded = await once(video, 'loadedmetadata', 4000);
    if (!loaded || !video.videoWidth || !Number.isFinite(video.duration)) {
      host.appendChild(
        el(
          'p',
          'admin-hint',
          'This browser cannot show a preview of this video, so a cover frame cannot be taken from it. Choose a cover image from the list, or none.',
        ),
      );
      return;
    }
    for (const warning of videoWarnings({
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      bytes: file.size,
    })) {
      const note = el('p', 'admin-field-warning', warning);
      note.setAttribute('role', 'status');
      host.appendChild(note);
    }
    slider.max = String(video.duration);
    slider.value = String(Math.max(0.1, Math.round(video.duration * 10) / 100));
    await seekTo(Number(slider.value));
    // `append` is typed for the Workers runtime in this project: add the children one by one.
    for (const child of [video, slider, label]) picker.appendChild(child);
    host.appendChild(picker);

    // The frame is the default cover, unless the editor has already chosen an image.
    select.insertBefore(option, select.options[1] ?? null);
    if (select.value === '') select.value = FRAME_OPTION;
    ready = true;
    showPicker();
  })();

  const capture = async (): Promise<File | null> => {
    if (!ready) return null;
    if (video.seeking) await once(video, 'seeked', 3000);
    const width = Math.min(video.videoWidth, 1600);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((video.videoHeight * width) / video.videoWidth);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ? new File([blob], 'cover.jpg', { type: 'image/jpeg' }) : null;
  };

  return {
    async resolvePoster(altText, onStatus) {
      if (select.value !== FRAME_OPTION) return { ok: true, posterId: select.value || undefined };
      onStatus?.('Preparing the cover image…');
      const frame = await capture();
      if (!frame) {
        return {
          ok: false,
          error: 'Could not take the cover image from this video. Choose another cover, or none.',
        };
      }
      const description = `Cover image of the video: ${altText}`.slice(0, 500);
      const result = await uploadImage(frame, description, false, onStatus);
      if (result.ok) return { ok: true, posterId: result.item.id };
      // The same frame was picked before: that image is the cover.
      if (isDuplicate(result)) return { ok: true, posterId: result.existing.id };
      return { ok: false, error: `The cover image: ${result.error}` };
    },
    destroy() {
      select.removeEventListener('change', showPicker);
      option.remove();
      if (select.value === FRAME_OPTION) select.value = '';
      video.removeAttribute('src');
      URL.revokeObjectURL(url);
      host.replaceChildren();
    },
  };
}
