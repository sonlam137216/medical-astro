import type { SlotKey } from '../image-slots';
import type { Field, FieldErrors, ItemColumn, Row } from './fields';
import {
  COMPARE_FIELD,
  COUNTRIES_FIELD,
  MAX_COUNTRIES,
  costTableErrors,
  upgradeCostTable,
} from './cost-table.ts';

// The text of the page sections that the admin can edit ("Page text"). Each section is one row of `page_sections`
// (type = the key below), with its content in the `data` column. The code owns the layout and the built-in
// content (src/data); a row only replaces the words. A section with no row keeps the built-in content, a row with
// "Show this section" off hides the section. See mergeSection for how a row is combined with the built-in content.

export interface SectionDef {
  /** `page_sections.type`: lowercase letters, digits and underscores. */
  key: string;
  /** The page that owns the row (a shared section is owned by the first page that shows it). */
  page: string;
  /** Name in the admin list. */
  label: string;
  /** Where it appears, in plain words. */
  where: string;
  fields: Field[];
  /** False for a heading that has no content of its own to switch off. Defaults to true. */
  canHide?: boolean;
  /** Rules that need more than one field, run after each field's own rules (on Save and on Publish). */
  check?: (value: Row) => FieldErrors;
}

export const SECTION_DATA_VERSION = 1;

const text = (
  name: string,
  label: string,
  max: number,
  o: { required?: boolean; help?: string } = {},
): Field => ({
  type: 'text',
  name,
  label,
  max,
  ...o,
});
const area = (
  name: string,
  label: string,
  max: number,
  o: { required?: boolean; help?: string; rows?: number } = {},
): Field => ({ type: 'textarea', name, label, max, rows: o.rows ?? 4, ...o });
const lines = (
  name: string,
  label: string,
  maxItems: number,
  maxLength: number,
  help?: string,
): Field => ({
  type: 'lines',
  name,
  label,
  maxItems,
  maxLength,
  help,
});
const items = (
  name: string,
  label: string,
  itemLabel: string,
  maxItems: number,
  columns: ItemColumn[],
  o: { required?: boolean; help?: string } = {},
): Field => ({ type: 'items', name, label, itemLabel, maxItems, columns, ...o });
const col = (
  name: string,
  label: string,
  kind: ItemColumn['kind'],
  max: number,
  required = false,
  help?: string,
): ItemColumn => ({ name, label, kind, max, required, help });

const choice = (
  name: string,
  label: string,
  options: readonly { value: string; label: string }[],
  help?: string,
): ItemColumn => ({ name, label, kind: 'choice', max: 40, options, help });

/**
 * Icons the admin can put on a "How it works" step, a card or a highlight badge (names from src/lib/icons.ts,
 * which checks they exist). One list for every icon column, so the same picture means the same thing everywhere.
 */
export const ICON_CHOICES = [
  { value: 'camera', label: 'Camera (photos)' },
  { value: 'message-dots', label: 'Chat bubble (advice, questions)' },
  { value: 'messages', label: 'Two chat bubbles (conversation, language)' },
  { value: 'headset', label: 'Headset (always reachable)' },
  { value: 'language', label: 'Language (spoken languages)' },
  { value: 'list-check', label: 'Checklist (compare, choose)' },
  { value: 'calendar-check', label: 'Calendar (book a date)' },
  { value: 'calendar-time', label: 'Calendar with clock (plan, schedule)' },
  { value: 'plane-tilt', label: 'Plane (travel)' },
  { value: 'plane-arrival', label: 'Plane landing (arrival, pickup)' },
  { value: 'car', label: 'Car (transfer)' },
  { value: 'hotel-service', label: 'Hotel bell (stay)' },
  { value: 'building', label: 'Building (hotel, clinic)' },
  { value: 'device-sim', label: 'SIM card (phone, connectivity)' },
  { value: 'e-passport', label: 'Passport (visa)' },
  { value: 'file-certificate', label: 'Document (paperwork, records)' },
  { value: 'map-pin', label: 'Map pin (place, clinic)' },
  { value: 'map-2', label: 'Map (local guide)' },
  { value: 'stethoscope', label: 'Stethoscope (doctor, check-up)' },
  { value: 'dental', label: 'Tooth (treatment)' },
  { value: 'device-desktop-analytics', label: 'Screen (technology, 3D imaging)' },
  { value: 'clipboard-check', label: 'Clipboard (plan, report)' },
  { value: 'certificate', label: 'Certificate (warranty)' },
  { value: 'shield-check', label: 'Shield (safety, quality)' },
  { value: 'coin', label: 'Coin (price)' },
  { value: 'users-group', label: 'Group of people (team, patients)' },
  { value: 'heart-handshake', label: 'Handshake (support, care)' },
  { value: 'mood-smile', label: 'Smile (result)' },
] as const;
export type ChoiceIcon = (typeof ICON_CHOICES)[number]['value'];

const iconColumn = (help: string) => choice('icon', 'Icon', ICON_CHOICES, help);

/**
 * The badges of a banner. Saved as a list of lines before they had icons (2026-10-17); upgradeSectionData turns
 * those rows into cards.
 */
const highlights = (maxItems: number, help: string): Field =>
  items(
    'chips',
    'Highlights',
    'Highlight',
    maxItems,
    [
      col('text', 'Text', 'text', 60, true),
      iconColumn('Shown before the text. With “None” the badge has no icon.'),
    ],
    { help },
  );

const label = text('label', 'Small heading above the title', 120, { required: true });
const title = text('title', 'Title', 200, { required: true });
const titleLines = area('title', 'Title', 200, {
  required: true,
  rows: 3,
  help: 'A new line starts a new line of the title.',
});
const image = (help: string, slot: SlotKey, name = 'image', fieldLabel = 'Photo'): Field => ({
  type: 'image',
  name,
  label: fieldLabel,
  help,
  slot,
});

/** The photo fields of "About: clinic photos", in reading order of the layout (about.astro). */
export const CLINIC_PHOTOS = [
  ['photo1', 'Photo 1 (left, top)', 'about-clinic'],
  ['photo2', 'Photo 2 (left, bottom)', 'about-clinic'],
  ['photo3', 'Photo 3 (right, top left)', 'about-clinic'],
  ['photo4', 'Photo 4 (right, top right)', 'about-clinic'],
  ['photo5', 'Photo 5 (right, bottom left)', 'about-clinic-square'],
  ['photo6', 'Photo 6 (right, bottom right)', 'about-clinic-square'],
] as const satisfies readonly (readonly [string, string, SlotKey])[];

const countries: Field = {
  ...lines(
    COUNTRIES_FIELD,
    'Countries (table columns)',
    MAX_COUNTRIES,
    40,
    'One country per line, in the order of the columns. The first is Vietnam (Melatec’s prices, in blue); the visitor compares it with one of the others. Removing a country also means removing its price line from each treatment.',
  ),
  required: true,
};
const compare = text(COMPARE_FIELD, 'Country compared when the page opens', 40, {
  help: 'One of the countries above, other than the first. Leave empty to use the second one.',
});
const costRows = (name: string, label: string) =>
  items(
    name,
    label,
    'Treatment',
    8,
    [
      col('name', 'Treatment', 'text', 120, true),
      col('note', 'Short note', 'text', 200),
      col(
        'cells',
        'Prices by country',
        'lines',
        120,
        false,
        'One line per country: the country as written in the Countries list, a colon, the price, then “ | ” and the number of clinics, for example “Australia: A$1,250 | 40 clinics”. Only enter figures the clinic can back up. A country with no line shows “—”.',
      ),
      col(
        'saving',
        'Saving',
        'text',
        60,
        false,
        'For example “Up to 70%”. Leave empty to show “—”.',
      ),
    ],
    {
      help: 'Only use real, checked prices. The visitor chooses which country to compare with the first one.',
    },
  );
const methodology = area('methodology', 'How these figures are worked out', 1500, {
  rows: 5,
  help: 'Shown when the visitor opens “How these figures are worked out”. Leave empty to show a short “to be provided” note.',
});

export const SECTIONS: SectionDef[] = [
  // ---- Home --------------------------------------------------------------------------------------------------
  {
    key: 'home_hero',
    page: '/',
    label: 'Home: top banner',
    where: 'The first screen of the Home page.',
    fields: [
      label,
      text('title', 'Title', 160, { required: true }),
      lines('paragraphs', 'Paragraphs', 4, 400, 'One paragraph per line.'),
      area('trust', 'Line under the buttons', 200, {
        rows: 2,
        help: 'For example the countries your patients come from. Only claims the clinic can back up. Leave empty to show nothing.',
      }),
    ],
  },
  {
    key: 'home_support',
    page: '/',
    label: 'Home: four reasons strip',
    where: 'The four cards under the top banner.',
    fields: [
      items('items', 'Cards', 'Card', 6, [col('title', 'Text', 'textarea', 120, true)], {
        required: true,
      }),
    ],
  },
  {
    key: 'home_services',
    page: '/',
    label: 'Home: services heading',
    where: 'The heading above the service cards (the cards themselves are in Services).',
    canHide: false,
    fields: [label, title],
  },
  {
    key: 'home_costs',
    page: '/',
    label: 'Home: treatment costs table',
    where:
      'The price comparison table on the Home page. The same table shows on every service page (Services > a service), except Dental Implants, which has its own.',
    fields: [label, titleLines, countries, compare, costRows('rows', 'Treatments'), methodology],
    check: costTableErrors,
  },
  {
    key: 'home_conversations',
    page: '/',
    label: 'Home: dentists & patients (video)',
    where: 'The text beside the videos or picture.',
    fields: [
      label,
      titleLines,
      area('body', 'Text', 600),
      items(
        'videos',
        'Videos',
        'Video',
        8,
        [
          col(
            'url',
            'YouTube or Vimeo link',
            'video',
            300,
            true,
            'Paste the address of the video page, for example https://www.youtube.com/watch?v=…',
          ),
          col('title', 'Title', 'text', 120, false, 'Shown under the video. Optional.'),
        ],
        {
          help: 'Shown beside the text, one at a time with arrows to move between them. These replace the Home page video of Site details. The cover of each video is taken from YouTube or Vimeo when the website is built.',
        },
      ),
      {
        type: 'weburl',
        name: 'channelUrl',
        label: '“View all videos” link',
        max: 300,
        placeholder: 'https://www.youtube.com/@…',
        help: 'The address of your YouTube channel (or any page with all your videos). Shows a “View all videos” button under the text. Leave empty to show no button.',
      },
      image(
        'Shown when there are no videos here and none is chosen in Site details; also the cover of a video whose own cover cannot be found. Leave empty to keep the built-in picture.',
        'home-conversations',
      ),
    ],
  },
  {
    key: 'home_why',
    page: '/',
    label: 'Home: why Melatec',
    where: 'The numbered list beside the heading.',
    fields: [
      label,
      title,
      area('body', 'Introduction', 500),
      items('items', 'Points', 'Point', 6, [
        col('title', 'Title', 'text', 120, true),
        col('body', 'Text', 'textarea', 300),
      ]),
    ],
  },
  {
    key: 'home_inside',
    page: '/',
    label: 'Home: clinic photo strip',
    where:
      'The row of clinic photos. The photos themselves stay as built; this edits the captions.',
    fields: [
      title,
      items('tiles', 'Captions', 'Caption', 8, [col('caption', 'Caption', 'text', 80, true)]),
    ],
  },
  {
    key: 'home_locations',
    page: '/',
    label: 'Home: clinic locations heading',
    where: 'The heading above the clinic cards (the clinics are in Locations).',
    canHide: false,
    fields: [label, title, area('body', 'Text', 400)],
  },
  {
    key: 'home_doctors',
    page: '/',
    label: 'Home: doctors heading',
    where: 'The heading above the doctor cards (the doctors are in Doctors).',
    canHide: false,
    fields: [label, title, area('body', 'Text', 400)],
  },
  {
    key: 'home_how',
    page: '/',
    label: 'Home: how it works',
    where:
      'The numbered steps on the blue band (also shown under “Your Seamless Dental Journey” on inner pages).',
    fields: [
      label,
      title,
      items('steps', 'Steps', 'Step', 6, [
        col('title', 'Title', 'text', 80, true),
        col('body', 'Text', 'textarea', 200),
        col(
          'tag',
          'Where it happens',
          'text',
          30,
          false,
          'A short tag above the step, for example “Online” or “In Vietnam”. Leave empty for none.',
        ),
        iconColumn(
          'Shown in the circle, with the step number in its corner. With “None” the circle shows the number.',
        ),
      ]),
      text('helpTitle', 'Help line (bold)', 120),
      text('helpBody', 'Help line', 200),
    ],
  },
  {
    key: 'home_smile',
    page: '/',
    label: 'Home: smile transformation',
    where:
      'The heading above the before/after slides. The slides (story and photos) are in Smile stories; until one is published the block shows the built-in sample story.',
    fields: [label, title],
  },
  {
    key: 'home_travel',
    page: '/',
    label: 'Home: travel guide heading',
    where: 'The heading above the travel guide articles (the articles are in Articles).',
    canHide: false,
    fields: [label, title],
  },
  // ---- About -------------------------------------------------------------------------------------------------
  {
    key: 'about_hero',
    page: '/about',
    label: 'About: top banner',
    where: 'The banner of the About page.',
    fields: [label, title, lines('paragraphs', 'Paragraphs', 4, 600, 'One paragraph per line.')],
  },
  {
    key: 'about_stats',
    page: '/about',
    label: 'About: figures',
    where:
      'The four figures under the banner (also on Dental Implants). Only figures the clinic can prove.',
    fields: [
      items(
        'items',
        'Figures',
        'Figure',
        6,
        [
          col('value', 'Figure', 'text', 30, true),
          col('label', 'What it counts', 'text', 80, true),
        ],
        { required: true },
      ),
    ],
  },
  {
    key: 'about_care',
    page: '/about',
    label: 'About: personalised care',
    where: 'The two rows with photos. The photos stay as built; this edits the words.',
    fields: [
      label,
      title,
      items('rows', 'Rows', 'Row', 4, [
        col('title', 'Title', 'text', 120, true),
        col('body', 'Text', 'textarea', 400),
      ]),
    ],
  },
  {
    key: 'about_why',
    page: '/about',
    label: 'About: why choose Melatec',
    where: 'The cards on the dark band.',
    fields: [
      label,
      title,
      items('items', 'Cards', 'Card', 8, [
        col('title', 'Title', 'text', 120, true),
        col('body', 'Text', 'textarea', 300),
        iconColumn('Shown above the title. With “None” the card has no icon.'),
      ]),
    ],
  },
  {
    key: 'about_inside',
    page: '/about',
    label: 'About: clinic photos',
    where:
      'The six clinic photos on the About page (“Inside Melatec Dental Clinic”): two big ones on the left, two smaller ones and two squares on the right.',
    fields: [
      label,
      title,
      ...CLINIC_PHOTOS.map(([name, fieldLabel, slot]) =>
        image(
          'Leave empty to keep the built-in photo in this place. Pick photos of the clinic itself (rooms, reception, equipment); people in them must have agreed to it.',
          slot,
          name,
          fieldLabel,
        ),
      ),
    ],
  },
  // ---- Services, doctors, packages ------------------------------------------------------------------------------
  {
    key: 'services_hero',
    page: '/services',
    label: 'Services: top banner',
    where: 'The banner of the Services page.',
    fields: [label, title, area('body', 'Text', 500)],
  },
  {
    key: 'shared_tourism',
    page: '/services',
    label: 'Dental tourism support',
    where: 'The six support cards on Services, Dental Packages and Travel Combos.',
    fields: [
      label,
      title,
      items('items', 'Cards', 'Card', 8, [
        col('title', 'Title', 'text', 80, true),
        col('body', 'Text', 'textarea', 300),
        iconColumn('Shown before the title. With “None” the card has no icon.'),
      ]),
    ],
  },
  {
    key: 'shared_journey',
    page: '/services',
    label: 'Seamless journey banner',
    where: 'The photo banner with a title (Services, About, Dental Implants).',
    canHide: false,
    fields: [label, title],
  },
  {
    key: 'service_situations',
    page: '/services',
    label: 'Service pages: which treatment fits',
    where:
      'The heading and the “Not sure which option is right for you?” line of the “Which treatment fits your situation” block on every service page, Dental Implants included. The cards are added per service (Services > a service > Treatment situations), and a service can have its own small heading. A service without situations does not show the block.',
    fields: [
      label,
      title,
      text('askTitle', 'Question under the cards', 160, { required: true }),
      area('askBody', 'Text under the question', 400, {
        help: 'Shown beside the “Book free consultation” button.',
      }),
    ],
  },
  {
    key: 'service_results',
    page: '/services',
    label: 'Service pages: results heading',
    where:
      'The heading above the before/after slider on every service page, Dental Implants included (the pictures are in Smile results). Without any picture pair the block is not shown.',
    fields: [label, title],
  },
  {
    key: 'service_faq',
    page: '/services',
    label: 'Service pages: FAQ heading',
    where:
      'The heading above the questions on every service page, Dental Implants included (the questions are in FAQs: one list for all the services).',
    canHide: false,
    fields: [label, title],
  },
  {
    key: 'service_articles',
    page: '/services',
    label: 'Service pages: articles under the FAQ',
    where:
      'The round arrow button under the questions of every service page, Dental Implants included. It opens the articles ticked “Show on the service pages” in Articles (one list for all the services); without any such article the button is not shown.',
    fields: [text('button', 'Text of the arrow button', 60, { required: true })],
  },
  {
    key: 'doctors_hero',
    page: '/our-doctors',
    label: 'Doctors: top banner',
    where: 'The banner of the Our Doctors page.',
    fields: [
      label,
      title,
      area('body', 'Text', 500),
      highlights(
        3,
        'Short claims shown as badges, for example “English-speaking doctors”. Only claims the clinic can back up.',
      ),
    ],
  },
  {
    key: 'packages_hero',
    page: '/dental-packages',
    label: 'Dental Packages: top banner',
    where: 'The banner of the Dental Packages page.',
    fields: [label, title, area('body', 'Text', 500)],
  },
  {
    key: 'combos_hero',
    page: '/dental-packages/travel-combos',
    label: 'Travel Combos: top banner',
    where: 'The banner of the Travel Combos page.',
    fields: [label, title, area('body', 'Text', 500)],
  },
  // ---- Dental Implants -----------------------------------------------------------------------------------------
  {
    key: 'implants_hero',
    page: '/services/dental-implants',
    label: 'Dental Implants: top banner',
    where: 'The banner of the Dental Implants page.',
    fields: [
      label,
      title,
      area('body', 'Text', 500),
      highlights(
        4,
        'Short claims shown as badges under the banner, for example “Consulting in English”. Only claims the clinic can back up.',
      ),
    ],
  },
  {
    key: 'implants_costs',
    page: '/services/dental-implants',
    label: 'Dental Implants: what you pay',
    where:
      'The heading above the price cards (the cards are the treatments of the Dental Implants service, in Services).',
    canHide: false,
    fields: [label, title],
  },
  {
    key: 'implants_comparison',
    page: '/services/dental-implants',
    label: 'Dental Implants: cost comparison',
    where: 'The price table on the Dental Implants page.',
    fields: [label, title, countries, compare, costRows('rows', 'Treatments'), methodology],
    check: costTableErrors,
  },
  {
    key: 'implants_why',
    page: '/services/dental-implants',
    label: 'Dental Implants: why Melatec',
    where: 'The six cards on the dark band.',
    fields: [
      label,
      title,
      items('items', 'Cards', 'Card', 8, [
        col('title', 'Title', 'text', 120, true),
        col('body', 'Text', 'textarea', 300),
      ]),
    ],
  },
  {
    key: 'implants_plan',
    page: '/services/dental-implants',
    label: 'Dental Implants: get your plan',
    where: 'The text beside the consultation form.',
    fields: [
      label,
      title,
      area('body', 'Text', 600),
      lines('bullets', 'Points', 5, 200, 'One point per line.'),
    ],
  },
];

export const sectionByKey = (key: string | undefined) => SECTIONS.find((s) => s.key === key);

/**
 * Whether a section is shown. One that cannot be switched off has no "Show" checkbox in its form and is always
 * shown (rows saved before 2026-10-20 recorded it as hidden).
 */
export const sectionShown = (def: Pick<SectionDef, 'canHide'>, isVisible: boolean) =>
  def.canHide === false || isVisible;

/**
 * Sections that carry claims or figures nobody has checked yet in the built-in content (prices, patient counts,
 * a real patient's photo, "years of experience"). A production publish needs a decision on each: write the real
 * text, or switch the section off.
 */
export const REQUIRED_SECTIONS = [
  'home_hero',
  'home_costs',
  'home_smile',
  'about_stats',
  'doctors_hero',
  'implants_comparison',
] as const;

// ---------------------------------------------------------------------------
// Combining a row with the built-in content
// ---------------------------------------------------------------------------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const pad = (n: number) => String(n).padStart(2, '0');

const emptyValue = (kind: 'text' | 'textarea' | 'lines' | 'choice' | 'video' | 'items') =>
  kind === 'lines' || kind === 'items' ? [] : '';

/**
 * A row saved before a field (or a card column) was added has no value for it. Without this, the built-in words
 * of that field would show next to the admin's own words; with it, the missing field counts as left empty.
 */
function fillMissingWords(fields: Field[], data: Obj): Obj {
  const out: Obj = { ...data };
  for (const f of fields) {
    if (f.type !== 'text' && f.type !== 'textarea' && f.type !== 'lines' && f.type !== 'items')
      continue;
    if (!(f.name in out)) out[f.name] = emptyValue(f.type);
    if (f.type === 'items' && Array.isArray(out[f.name])) {
      out[f.name] = (out[f.name] as unknown[]).map((item) => {
        if (!isObj(item)) return item;
        const filled: Obj = { ...item };
        for (const c of f.columns) if (!(c.name in filled)) filled[c.name] = emptyValue(c.kind);
        return filled;
      });
    }
  }
  return out;
}

/**
 * Brings a saved row up to the current fields: a card list that was saved as plain lines (the banner highlights,
 * before they had icons) becomes cards whose first column holds each line; a cost table saved before its countries
 * could be edited gets the old columns (upgradeCostTable). Used wherever a saved row is read: the
 * admin form, the snapshot, and the pages built from older revisions.
 */
export function upgradeSectionData(fields: readonly Field[], data: Obj): Obj {
  let out = fields.some((f) => f.name === COUNTRIES_FIELD) ? upgradeCostTable(data) : data;
  for (const f of fields) {
    if (f.type !== 'items') continue;
    const v = out[f.name];
    const first = f.columns[0]?.name;
    if (!first || !Array.isArray(v) || !v.some((item) => typeof item === 'string')) continue;
    out = {
      ...out,
      [f.name]: v.map((item) => (typeof item === 'string' ? { [first]: item } : item)),
    };
  }
  return out;
}

/**
 * The words of a row replace the built-in words; anything the admin cannot edit (photos, links, fixed lists)
 * stays as built. Cards in a list keep the non-text parts of the built-in card at the same position (for
 * example its picture), and a "01", "02"... numbering follows the new order. With `fields`, a field the row has
 * no value for (it was added after the row was saved) is treated as empty rather than as the built-in words.
 */
export function mergeSection<T extends Obj>(sample: T, saved: Obj, fields?: Field[]): T {
  const data = fields ? fillMissingWords(fields, upgradeSectionData(fields, saved)) : saved;
  const out: Obj = { ...sample };
  for (const [key, value] of Object.entries(data)) {
    const base = sample[key];
    if (Array.isArray(value) && Array.isArray(base) && base.every(isObj)) {
      out[key] = value.map((item, i) => {
        if (!isObj(item)) return item;
        const carried = (base[Math.min(i, base.length - 1)] ?? {}) as Obj;
        const merged: Obj = { ...carried, ...item };
        for (const numbering of ['number', 'eyebrow']) {
          if (
            typeof carried[numbering] === 'string' &&
            /^\d{2}$/.test(carried[numbering] as string)
          )
            merged[numbering] = pad(i + 1);
        }
        return merged;
      });
    } else {
      out[key] = value;
    }
  }
  return out as T;
}
