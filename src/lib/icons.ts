// The icons of the public site: Tabler Icons (MIT, https://tabler.io/icons), outline style drawn at stroke 1.75,
// chosen by the owner on 2026-10-16 over Phosphor. Figma has almost no icons, so where they appear
// is our own addition. Each SVG is read as text at build time and inlined by Icon.astro: no icon font, no script,
// and only the icons listed here end up in the HTML. To add one, import it below and add it to ICONS.
import arrowLeft from '@tabler/icons/outline/arrow-left.svg?raw';
import arrowRight from '@tabler/icons/outline/arrow-right.svg?raw';
import brandWhatsapp from '@tabler/icons/outline/brand-whatsapp.svg?raw';
import calendarCheck from '@tabler/icons/outline/calendar-check.svg?raw';
import camera from '@tabler/icons/outline/camera.svg?raw';
import car from '@tabler/icons/outline/car.svg?raw';
import certificate from '@tabler/icons/outline/certificate.svg?raw';
import check from '@tabler/icons/outline/check.svg?raw';
import chevronDown from '@tabler/icons/outline/chevron-down.svg?raw';
import clipboardCheck from '@tabler/icons/outline/clipboard-check.svg?raw';
import clock from '@tabler/icons/outline/clock.svg?raw';
import dental from '@tabler/icons/outline/dental.svg?raw';
import directions from '@tabler/icons/outline/directions.svg?raw';
import hotelService from '@tabler/icons/outline/hotel-service.svg?raw';
import language from '@tabler/icons/outline/language.svg?raw';
import listCheck from '@tabler/icons/outline/list-check.svg?raw';
import lock from '@tabler/icons/outline/lock.svg?raw';
import mail from '@tabler/icons/outline/mail.svg?raw';
import mapPin from '@tabler/icons/outline/map-pin.svg?raw';
import messageDots from '@tabler/icons/outline/message-dots.svg?raw';
import moodSmile from '@tabler/icons/outline/mood-smile.svg?raw';
import phone from '@tabler/icons/outline/phone.svg?raw';
import planeArrival from '@tabler/icons/outline/plane-arrival.svg?raw';
import planeTilt from '@tabler/icons/outline/plane-tilt.svg?raw';
import playerPlay from '@tabler/icons/outline/player-play.svg?raw';
import search from '@tabler/icons/outline/search.svg?raw';
import send from '@tabler/icons/outline/send.svg?raw';
import shieldCheck from '@tabler/icons/outline/shield-check.svg?raw';
import stethoscope from '@tabler/icons/outline/stethoscope.svg?raw';
import starFilled from '@tabler/icons/filled/star.svg?raw';
import type { StepIcon } from './cms/sections';

const ICONS = {
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  'brand-whatsapp': brandWhatsapp,
  'calendar-check': calendarCheck,
  camera,
  car,
  certificate,
  check,
  'chevron-down': chevronDown,
  'clipboard-check': clipboardCheck,
  clock,
  dental,
  directions,
  'hotel-service': hotelService,
  language,
  'list-check': listCheck,
  lock,
  mail,
  'map-pin': mapPin,
  'message-dots': messageDots,
  'mood-smile': moodSmile,
  phone,
  'plane-arrival': planeArrival,
  'plane-tilt': planeTilt,
  'player-play': playerPlay,
  search,
  send,
  'shield-check': shieldCheck,
  stethoscope,
  'star-filled': starFilled,
};

export type IconName = keyof typeof ICONS;

// Every icon the admin can pick for a "How it works" step must exist here (checked by `npm run check`).
const STEP_ICONS_EXIST: Record<StepIcon, string> = ICONS;
void STEP_ICONS_EXIST;

export const isIconName = (v: unknown): v is IconName => typeof v === 'string' && v in ICONS;

export interface IconSvg {
  /** Everything inside the <svg> element. */
  body: string;
  /** Solid shapes (`fill`) rather than lines (`stroke`). */
  filled: boolean;
}

const cache = new Map<IconName, IconSvg>();

export function iconSvg(name: IconName): IconSvg {
  let svg = cache.get(name);
  if (!svg) {
    const source = ICONS[name];
    const root = /<svg[^>]*>/.exec(source)?.[0] ?? '';
    const body = source
      .slice(source.indexOf(root) + root.length, source.lastIndexOf('</svg>'))
      // Tabler's invisible 24×24 bounding box, only useful in design tools.
      .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '')
      .replace(/\s+/g, ' ')
      .trim();
    svg = { body, filled: /fill="currentColor"/.test(root) };
    cache.set(name, svg);
  }
  return svg;
}
