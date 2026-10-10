import type { Field, ItemColumn } from './fields';

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

const label = text('label', 'Small heading above the title', 120, { required: true });
const title = text('title', 'Title', 200, { required: true });
const titleLines = area('title', 'Title', 200, {
  required: true,
  rows: 3,
  help: 'A new line starts a new line of the title.',
});
const image = (help: string): Field => ({ type: 'image', name: 'image', label: 'Photo', help });

const COUNTRY_ORDER = 'Vietnam, United States, Australia, United Kingdom, Canada, New Zealand';
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
        80,
        false,
        `One line per country, in this order: ${COUNTRY_ORDER}. Write the price, then “ | ” and the number of clinics, for example “A$1,250 | 40 clinics”. Only enter figures the clinic can back up. An empty line shows “—”.`,
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
      help: 'Only use real, checked prices. The country columns are fixed; the visitor chooses which country to compare with Vietnam.',
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
    where: 'The price comparison table on the Home page.',
    fields: [label, titleLines, costRows('rows', 'Treatments'), methodology],
  },
  {
    key: 'home_conversations',
    page: '/',
    label: 'Home: dentists & patients (video)',
    where: 'The text beside the video or picture.',
    fields: [
      label,
      titleLines,
      area('body', 'Text', 600),
      image(
        'Shown when no video is chosen in Site details. Leave empty to keep the built-in picture.',
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
    where: 'The four steps on the blue band.',
    fields: [
      label,
      title,
      items('steps', 'Steps', 'Step', 6, [
        col('title', 'Title', 'text', 80, true),
        col('body', 'Text', 'textarea', 200),
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
      'The before/after story. It shows a real patient: only publish it with their written consent.',
    fields: [
      label,
      title,
      area('summary', 'Story', 700, { required: true }),
      text('detailsTitle', 'Details heading', 80),
      lines('details', 'Treatment details', 6, 160, 'One item per line.'),
      image(
        'The before/after photo. Without a photo the story is shown without a picture. Only use a photo the patient agreed in writing to share.',
      ),
    ],
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
      ]),
    ],
  },
  {
    key: 'about_inside',
    page: '/about',
    label: 'About: clinic photos heading',
    where: 'The heading above the clinic photos.',
    canHide: false,
    fields: [label, title],
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
    key: 'doctors_hero',
    page: '/our-doctors',
    label: 'Doctors: top banner',
    where: 'The banner of the Our Doctors page.',
    fields: [
      label,
      title,
      area('body', 'Text', 500),
      lines(
        'chips',
        'Highlights',
        3,
        60,
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
    fields: [label, title, area('body', 'Text', 500)],
  },
  {
    key: 'implants_costs',
    page: '/services/dental-implants',
    label: 'Dental Implants: what you pay',
    where: 'The three price cards.',
    fields: [
      label,
      title,
      items(
        'cards',
        'Cards',
        'Card',
        6,
        [
          col('title', 'Title', 'text', 80, true),
          col('inclusions', 'Text lines', 'lines', 200, false, 'One point per line.'),
          col(
            'total',
            'Price line',
            'text',
            80,
            false,
            'For example “TOTAL: $600” or “Personalised quote”.',
          ),
        ],
        { required: true },
      ),
    ],
  },
  {
    key: 'implants_comparison',
    page: '/services/dental-implants',
    label: 'Dental Implants: cost comparison',
    where: 'The price table on the Dental Implants page.',
    fields: [label, title, costRows('rows', 'Treatments'), methodology],
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
  {
    key: 'implants_faq',
    page: '/services/dental-implants',
    label: 'Dental Implants: FAQ heading',
    where: 'The heading above the questions (the questions are in FAQs, group “dental-implants”).',
    canHide: false,
    fields: [label, title],
  },
];

export const sectionByKey = (key: string | undefined) => SECTIONS.find((s) => s.key === key);

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
  'implants_costs',
  'implants_comparison',
] as const;

// ---------------------------------------------------------------------------
// Combining a row with the built-in content
// ---------------------------------------------------------------------------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The words of a row replace the built-in words; anything the admin cannot edit (photos, links, fixed lists)
 * stays as built. Cards in a list keep the non-text parts of the built-in card at the same position (for
 * example its picture), and a "01", "02"... numbering follows the new order.
 */
export function mergeSection<T extends Obj>(sample: T, data: Obj): T {
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
