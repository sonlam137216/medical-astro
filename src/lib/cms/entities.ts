import type { Field } from './fields';

// Every kind of content the admin can edit with the generic list / add / edit pages, described as data.
// Adding a module = adding an entry here (plus its part of the snapshot and its public pages).

export interface EntityDef {
  /** URL segment: /admin/content/<key> */
  key: string;
  table: string;
  singular: string;
  plural: string;
  /** Short explanation shown above the list. */
  intro: string;
  /** Field shown as the row's name in the list and in headings. */
  titleField: string;
  columns: { field: string; label: string }[];
  fields: Field[];
  order: { column: string; ascending?: boolean }[];
  /** False when rows are created by the code, not by an admin (the Pages list). Defaults to true. */
  creatable?: boolean;
  /** Whether the row can be deleted (rows other tables depend on are protected by the database). */
  deletable: boolean;
  /** Whether the entity has an `is_visible` column that the form should hide behind a checkbox. */
  menu?: boolean;
}

const sortOrder: Field = {
  type: 'int',
  name: 'sort_order',
  label: 'Display order (lowest first)',
  min: 0,
  max: 9999,
  default: 0,
};
const visible: Field = {
  type: 'bool',
  name: 'is_visible',
  label: 'Show on the website',
  default: true,
};

export const NAV_LOCATIONS = [
  ['utility', 'Top bar (utility link)'],
  ['header', 'Main menu'],
  ['footer_treatment', 'Footer: Treatment'],
  ['footer_explore', 'Footer: Explore'],
  ['footer_legal', 'Footer: legal links'],
] as const;

export const ENTITIES: EntityDef[] = [
  {
    key: 'navigation',
    table: 'navigation_items',
    singular: 'menu link',
    plural: 'Menu links',
    intro:
      'Links in the top bar, the main menu and the footer. Links to pages that do not exist yet will show a “not found” page, so only link to pages that are live.',
    titleField: 'label',
    columns: [
      { field: 'location', label: 'Where' },
      { field: 'label', label: 'Text' },
      { field: 'href', label: 'Link' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'select',
        name: 'location',
        label: 'Where it appears',
        options: NAV_LOCATIONS,
        default: 'header',
      },
      { type: 'text', name: 'label', label: 'Text', max: 80, required: true },
      { type: 'url', name: 'href', label: 'Link', max: 500, required: true, placeholder: '/about' },
      sortOrder,
      visible,
    ],
    order: [{ column: 'location' }, { column: 'sort_order' }],
    deletable: true,
  },
  {
    key: 'pages',
    table: 'pages',
    singular: 'page',
    plural: 'Pages (SEO)',
    intro:
      'The title and description search engines show for each page. Leave them empty to keep the built-in text. Pages cannot be added or renamed here.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Page' },
      { field: 'path', label: 'Address' },
      { field: 'seo_title', label: 'Search title' },
    ],
    fields: [
      { type: 'path', name: 'path', label: 'Address', readonly: true },
      { type: 'text', name: 'title', label: 'Page name (for the admin)', max: 200, required: true },
      {
        type: 'text',
        name: 'seo_title',
        label: 'Search title',
        max: 200,
        help: 'Around 50–60 characters works well.',
      },
      {
        type: 'textarea',
        name: 'seo_description',
        label: 'Search description',
        max: 400,
        rows: 3,
        help: 'Around 150 characters works well.',
      },
    ],
    order: [{ column: 'path' }],
    creatable: false,
    deletable: false,
  },
  {
    key: 'redirects',
    table: 'redirects',
    singular: 'redirect',
    plural: 'Redirects',
    intro:
      'Send an old page address to a new one, for example after renaming a page, so old links keep working. Redirects take effect after you publish.',
    titleField: 'from_path',
    columns: [
      { field: 'from_path', label: 'From' },
      { field: 'to_path', label: 'To' },
      { field: 'status_code', label: 'Type' },
    ],
    fields: [
      {
        type: 'path',
        name: 'from_path',
        label: 'Old address',
        required: true,
        placeholder: '/old-page',
        help: 'Lowercase letters, numbers and hyphens, starting with /.',
      },
      {
        type: 'url',
        name: 'to_path',
        label: 'New address',
        max: 500,
        required: true,
        placeholder: '/new-page',
      },
      {
        type: 'select',
        name: 'status_code',
        label: 'Type',
        options: [
          ['301', 'Permanent (301)'],
          ['302', 'Temporary (302)'],
        ],
        default: '301',
        help: 'Use permanent when a page has moved for good; temporary only for short-term changes.',
      },
    ],
    order: [{ column: 'from_path' }],
    deletable: true,
  },
  {
    key: 'faqs',
    table: 'faqs',
    singular: 'question',
    plural: 'FAQs',
    intro:
      'Frequently asked questions, in groups. A question without an answer is not shown on the website: answers about treatment must come from the clinic.',
    titleField: 'question',
    columns: [
      { field: 'group_key', label: 'Group' },
      { field: 'question', label: 'Question' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'slug',
        name: 'group_key',
        label: 'Group',
        help: 'Questions with the same group appear together, for example on the Dental Implants page.',
      },
      { type: 'text', name: 'question', label: 'Question', max: 300, required: true },
      {
        type: 'textarea',
        name: 'answer',
        label: 'Answer',
        max: 4000,
        rows: 6,
        help: 'Leave empty until the clinic has provided it.',
      },
      sortOrder,
      visible,
    ],
    order: [{ column: 'group_key' }, { column: 'sort_order' }],
    deletable: true,
  },
];

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'youtube', 'linkedin'] as const;

/** The single row of site-wide details, edited at /admin/site (not part of the generic list). */
export const SITE_FIELDS: Field[] = [
  { type: 'text', name: 'site_name', label: 'Clinic name', max: 120, required: true },
  { type: 'textarea', name: 'tagline', label: 'Tagline (footer)', max: 300, rows: 3 },
  {
    type: 'text',
    name: 'phone_display',
    label: 'Phone (as shown)',
    max: 40,
    placeholder: '(+84) 000 000 000',
  },
  {
    type: 'text',
    name: 'phone_intl',
    label: 'Phone (international format)',
    max: 40,
    placeholder: '+84 000 000 000',
  },
  {
    type: 'url',
    name: 'whatsapp_url',
    label: 'WhatsApp link',
    max: 500,
    placeholder: 'https://wa.me/84000000000',
  },
  { type: 'email', name: 'contact_email', label: 'Contact email (shown on the site)', max: 254 },
  { type: 'text', name: 'address_line', label: 'Address', max: 300 },
  {
    type: 'text',
    name: 'opening_hours',
    label: 'Opening hours',
    max: 200,
    placeholder: 'Monday–Sunday · 8:00–20:00',
  },
  { type: 'text', name: 'copyright_text', label: 'Copyright line', max: 200 },
  ...SOCIAL_PLATFORMS.map((p): Field => ({
    type: 'weburl',
    name: `social_${p}`,
    label: `${p[0].toUpperCase()}${p.slice(1)} page`,
    max: 300,
    placeholder: 'https://…',
    help: p === 'facebook' ? 'Leave a link empty to hide its icon.' : undefined,
  })),
];

export const entityByKey = (key: string | undefined) => ENTITIES.find((e) => e.key === key);
