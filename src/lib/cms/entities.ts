import type { Field } from './fields';
import { ARTICLE_KINDS, MAX_ARTICLE_BODY } from './articles';

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

export const PACKAGE_KINDS = [
  ['single_treatment', 'Dental Packages (single treatments)'],
  ['travel_combo', 'Travel Combos'],
] as const;

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
    key: 'services',
    table: 'services',
    singular: 'service',
    plural: 'Services',
    intro:
      'The treatments shown on the Home page, the Services page, the consultation forms and the article sidebar. Only fill in what the clinic has confirmed: a price or an included item that is left empty is simply not shown. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Service' },
      { field: 'price_text', label: 'Price text' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      { type: 'text', name: 'title', label: 'Name', max: 160, required: true },
      {
        type: 'slug',
        name: 'slug',
        label: 'Address name',
        from: 'title',
        help: 'Used to link to this service on the Services page. “dental-implants” links to the Dental Implants page.',
      },
      {
        type: 'textarea',
        name: 'summary',
        label: 'Short description',
        max: 400,
        rows: 4,
        help: 'Shown on the Services page.',
      },
      {
        type: 'lines',
        name: 'inclusions',
        label: 'What is included',
        maxItems: 8,
        maxLength: 120,
        help: 'One item per line, shown as a list on the Home page card.',
      },
      {
        type: 'text',
        name: 'price_text',
        label: 'Price text',
        max: 120,
        placeholder: 'From $600',
        help: 'Shown exactly as written on the Home page card. Leave empty to show no price.',
      },
      { type: 'image', name: 'image_id', label: 'Photo' },
      sortOrder,
      visible,
    ],
    order: [{ column: 'sort_order' }, { column: 'title' }],
    deletable: true,
  },
  {
    key: 'packages',
    table: 'packages',
    singular: 'package',
    plural: 'Packages',
    intro:
      'The price cards on the Dental Packages page (single treatments) and the Travel Combos page. A price is optional: without one the card shows no price. Link a package to a service to send visitors to that service; otherwise the card invites them to request a quote. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Package' },
      { field: 'kind', label: 'Page' },
      { field: 'price_amount', label: 'Price' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'select',
        name: 'kind',
        label: 'Shown on',
        options: PACKAGE_KINDS,
        default: 'single_treatment',
      },
      { type: 'text', name: 'title', label: 'Name', max: 160, required: true },
      { type: 'slug', name: 'slug', label: 'Address name', from: 'title' },
      {
        type: 'lines',
        name: 'inclusions',
        label: 'What is included',
        maxItems: 8,
        maxLength: 120,
        help: 'One item per line, shown as a list on the card.',
      },
      {
        type: 'money',
        name: 'price_amount',
        label: 'Price',
        currencyName: 'currency',
        help: 'Shown as “TOTAL: …” on the card. Leave empty to show no price.',
      },
      {
        type: 'text',
        name: 'price_conditions',
        label: 'Price note',
        max: 400,
        placeholder: 'Per person, flights not included',
        help: 'A short condition shown under the price. Only appears when a price is set.',
      },
      {
        type: 'ref',
        name: 'service_id',
        label: 'Related service',
        table: 'services',
        labelColumn: 'title',
      },
      { type: 'image', name: 'image_id', label: 'Photo' },
      sortOrder,
      visible,
    ],
    order: [{ column: 'kind' }, { column: 'sort_order' }, { column: 'title' }],
    deletable: true,
  },
  {
    key: 'destinations',
    table: 'destinations',
    singular: 'destination',
    plural: 'Travel destinations',
    intro:
      'The “Discover Vietnam” cards on the Travel Combos page: places to visit during a dental trip. These are not clinics (see Locations).',
    titleField: 'name',
    columns: [
      { field: 'name', label: 'Destination' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'text',
        name: 'name',
        label: 'Name',
        max: 160,
        required: true,
        placeholder: 'Da Nang',
      },
      { type: 'slug', name: 'slug', label: 'Address name', from: 'name' },
      {
        type: 'textarea',
        name: 'summary',
        label: 'Description',
        max: 400,
        rows: 4,
        required: true,
      },
      { type: 'image', name: 'image_id', label: 'Photo' },
      sortOrder,
      visible,
    ],
    order: [{ column: 'sort_order' }, { column: 'name' }],
    deletable: true,
  },
  {
    key: 'locations',
    table: 'locations',
    singular: 'clinic',
    plural: 'Locations',
    intro:
      'The clinics shown on the Home page, the Locations page and Travel Combos. “Directions link” is optional: when it is empty, the Directions button opens a Google Maps search for the address. A clinic without a photo is shown without a picture, so add one in Media.',
    titleField: 'name',
    columns: [
      { field: 'name', label: 'Clinic' },
      { field: 'address_line', label: 'Address' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'text',
        name: 'name',
        label: 'Clinic name',
        max: 160,
        required: true,
        placeholder: 'Melatec Ha Noi',
      },
      { type: 'slug', name: 'slug', label: 'Address name', from: 'name' },
      { type: 'text', name: 'address_line', label: 'Address', max: 300, required: true },
      {
        type: 'url',
        name: 'directions_url',
        label: 'Directions link',
        max: 500,
        placeholder: 'https://maps.google.com/…',
      },
      { type: 'image', name: 'image_id', label: 'Photo' },
      sortOrder,
      visible,
    ],
    order: [{ column: 'sort_order' }, { column: 'name' }],
    deletable: true,
  },
  {
    key: 'article-categories',
    table: 'article_categories',
    singular: 'article category',
    plural: 'Article categories',
    intro:
      'Groups for articles, for example the filters on the Dental Knowledge page. A category belongs to one kind of article. Deleting a category keeps its articles, which become uncategorised.',
    titleField: 'name',
    columns: [
      { field: 'kind', label: 'Kind' },
      { field: 'name', label: 'Name' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'select',
        name: 'kind',
        label: 'Kind of article',
        options: ARTICLE_KINDS,
        default: 'dental_knowledge',
      },
      { type: 'text', name: 'name', label: 'Name', max: 120, required: true },
      { type: 'slug', name: 'slug', label: 'Address name', from: 'name' },
      sortOrder,
      visible,
    ],
    order: [{ column: 'kind' }, { column: 'sort_order' }, { column: 'name' }],
    deletable: true,
  },
  {
    key: 'articles',
    table: 'articles',
    singular: 'article',
    plural: 'Articles',
    intro:
      'Travel guide and Dental knowledge articles. Tick “Published” when an article is ready: drafts never reach the website. A published article needs text, a summary and a date, and Dental knowledge articles also need a clinical reviewer. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Title' },
      { field: 'kind', label: 'Kind' },
      { field: 'published_on', label: 'Date' },
      { field: 'is_visible', label: 'Published' },
    ],
    fields: [
      {
        type: 'select',
        name: 'kind',
        label: 'Kind of article',
        options: ARTICLE_KINDS,
        default: 'travel_guide',
      },
      { type: 'text', name: 'title', label: 'Title', max: 200, required: true },
      {
        type: 'slug',
        name: 'slug',
        label: 'Address name',
        from: 'title',
        help: 'Used in the web address. Changing it after publishing breaks old links.',
      },
      {
        type: 'textarea',
        name: 'excerpt',
        label: 'Short summary',
        max: 500,
        rows: 3,
        help: 'Shown on the article cards and in search results.',
      },
      {
        type: 'textarea',
        name: 'body',
        label: 'Article text',
        max: MAX_ARTICLE_BODY,
        rows: 20,
        help: 'Write plain text. “## Heading” starts a section (listed in the table of contents), “### Heading” a smaller one, “- item” a bullet, “1. item” a numbered point, “> text” a quote, “**bold**” bold text and “[words](https://…)” a link. A blank line starts a new paragraph.',
      },
      { type: 'image', name: 'cover_image_id', label: 'Cover image' },
      {
        type: 'ref',
        name: 'category_id',
        label: 'Category',
        table: 'article_categories',
        labelColumn: 'name',
      },
      { type: 'text', name: 'author_name', label: 'Written by', max: 120 },
      {
        type: 'text',
        name: 'reviewed_by',
        label: 'Clinically reviewed by',
        max: 160,
        placeholder: 'Melatec Dental Team',
        help: 'Required for Dental knowledge articles. Only name people or teams who really reviewed the text.',
      },
      { type: 'date', name: 'reviewed_on', label: 'Reviewed on' },
      { type: 'date', name: 'published_on', label: 'Publication date' },
      { type: 'text', name: 'seo_title', label: 'Search title', max: 200 },
      { type: 'textarea', name: 'seo_description', label: 'Search description', max: 400, rows: 3 },
      {
        type: 'bool',
        name: 'is_visible',
        label: 'Published (visible on the website after you publish)',
        default: false,
      },
    ],
    order: [{ column: 'published_on', ascending: false }, { column: 'title' }],
    deletable: true,
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
  {
    type: 'ref',
    name: 'intro_video_id',
    label: 'Home page video',
    table: 'media_assets',
    labelColumn: 'alt_text',
    where: { kind: 'video', status: 'active' },
    help: 'Shows the “Watch video” button and a player on the Home page. Upload an MP4 in Media first (add a cover image there so people see a picture before pressing play). Choose “None” to show no video.',
  },
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
