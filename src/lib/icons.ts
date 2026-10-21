// The icons of the public site: Tabler Icons (MIT, https://tabler.io/icons), outline style drawn at stroke 1.75,
// chosen by the owner on 2026-10-16 over Phosphor. Figma has almost no icons, so where they appear
// is our own addition. Each SVG is read as text at build time and inlined by Icon.astro: no icon font, no script,
// and only the icons listed here end up in the HTML. To add one, import it below and add it to ICONS.
import arrowDown from '@tabler/icons/outline/arrow-down.svg?raw';
import arrowLeft from '@tabler/icons/outline/arrow-left.svg?raw';
import arrowRight from '@tabler/icons/outline/arrow-right.svg?raw';
import arrowUp from '@tabler/icons/outline/arrow-up.svg?raw';
import brandWhatsapp from '@tabler/icons/outline/brand-whatsapp.svg?raw';
import building from '@tabler/icons/outline/building.svg?raw';
import calendarCheck from '@tabler/icons/outline/calendar-check.svg?raw';
import calendarTime from '@tabler/icons/outline/calendar-time.svg?raw';
import camera from '@tabler/icons/outline/camera.svg?raw';
import car from '@tabler/icons/outline/car.svg?raw';
import certificate from '@tabler/icons/outline/certificate.svg?raw';
import check from '@tabler/icons/outline/check.svg?raw';
import chevronDown from '@tabler/icons/outline/chevron-down.svg?raw';
import clipboardCheck from '@tabler/icons/outline/clipboard-check.svg?raw';
import clock from '@tabler/icons/outline/clock.svg?raw';
import coin from '@tabler/icons/outline/coin.svg?raw';
import dental from '@tabler/icons/outline/dental.svg?raw';
import deviceDesktopAnalytics from '@tabler/icons/outline/device-desktop-analytics.svg?raw';
import deviceSim from '@tabler/icons/outline/device-sim.svg?raw';
import directions from '@tabler/icons/outline/directions.svg?raw';
import ePassport from '@tabler/icons/outline/e-passport.svg?raw';
import fileCertificate from '@tabler/icons/outline/file-certificate.svg?raw';
import headset from '@tabler/icons/outline/headset.svg?raw';
import heartHandshake from '@tabler/icons/outline/heart-handshake.svg?raw';
import hotelService from '@tabler/icons/outline/hotel-service.svg?raw';
import language from '@tabler/icons/outline/language.svg?raw';
import listCheck from '@tabler/icons/outline/list-check.svg?raw';
import lock from '@tabler/icons/outline/lock.svg?raw';
import mail from '@tabler/icons/outline/mail.svg?raw';
import map2 from '@tabler/icons/outline/map-2.svg?raw';
import mapPin from '@tabler/icons/outline/map-pin.svg?raw';
import messageDots from '@tabler/icons/outline/message-dots.svg?raw';
import messages from '@tabler/icons/outline/messages.svg?raw';
import moodSmile from '@tabler/icons/outline/mood-smile.svg?raw';
import phone from '@tabler/icons/outline/phone.svg?raw';
import planeArrival from '@tabler/icons/outline/plane-arrival.svg?raw';
import planeTilt from '@tabler/icons/outline/plane-tilt.svg?raw';
import playerPlay from '@tabler/icons/outline/player-play.svg?raw';
import search from '@tabler/icons/outline/search.svg?raw';
import send from '@tabler/icons/outline/send.svg?raw';
import shieldCheck from '@tabler/icons/outline/shield-check.svg?raw';
import stethoscope from '@tabler/icons/outline/stethoscope.svg?raw';
import usersGroup from '@tabler/icons/outline/users-group.svg?raw';
import starFilled from '@tabler/icons/filled/star.svg?raw';
import brandFacebookFilled from '@tabler/icons/filled/brand-facebook.svg?raw';
import brandWhatsappFilled from '@tabler/icons/filled/brand-whatsapp.svg?raw';
import mailFilled from '@tabler/icons/filled/mail.svg?raw';
import phoneFilled from '@tabler/icons/filled/phone.svg?raw';
import type { ChoiceIcon } from './cms/sections';

const ICONS = {
  'arrow-down': arrowDown,
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  'arrow-up': arrowUp,
  'brand-whatsapp': brandWhatsapp,
  'brand-whatsapp-filled': brandWhatsappFilled,
  'brand-facebook-filled': brandFacebookFilled,
  building,
  'calendar-check': calendarCheck,
  'calendar-time': calendarTime,
  camera,
  car,
  certificate,
  check,
  'chevron-down': chevronDown,
  'clipboard-check': clipboardCheck,
  clock,
  coin,
  dental,
  'device-desktop-analytics': deviceDesktopAnalytics,
  'device-sim': deviceSim,
  directions,
  'e-passport': ePassport,
  'file-certificate': fileCertificate,
  headset,
  'heart-handshake': heartHandshake,
  'hotel-service': hotelService,
  language,
  'list-check': listCheck,
  lock,
  mail,
  'map-2': map2,
  'map-pin': mapPin,
  'message-dots': messageDots,
  messages,
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
  'mail-filled': mailFilled,
  'phone-filled': phoneFilled,
  'users-group': usersGroup,
};

export type IconName = keyof typeof ICONS;

// Every icon the admin can pick (ICON_CHOICES) must exist here (checked by `npm run check`).
const CHOICE_ICONS_EXIST: Record<ChoiceIcon, string> = ICONS;
void CHOICE_ICONS_EXIST;

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
