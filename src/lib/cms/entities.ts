import type { Field } from './fields';
import { ARTICLE_KINDS, MAX_ARTICLE_BODY } from './articles';
import { MENU_GROUP_MAX } from '../menu';

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
  /**
   * The rows belong to a row of another entity (the treatments of a service): `field` is the `ref` field naming it.
   * The list can be filtered by it, "Add" from the parent's page starts with it chosen, saving or deleting goes back
   * to the parent's page, and the parent's page lists its rows.
   */
  parent?: { field: string; entity: string };
  /**
   * The form of one row, when it differs by row (the Home row of Pages has a taller banner): same field names as
   * `fields`, only the hints change, so saving reads `fields`.
   */
  fieldsFor?: (row: Record<string, unknown>) => Field[];
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

// The banner picture of a page in Pages: one height on every page but Home, whose first screen is taller.
const pageBanner: Field = {
  type: 'image',
  name: 'hero_image_id',
  label: 'Banner picture',
  slot: 'page-banner',
  help: 'The wide picture at the top of the page. The title sits over the left part, so keep the subject on the right. Empty: the built-in picture.',
};
const homeBanner: Field = {
  ...pageBanner,
  slot: 'home-hero',
  help: 'The picture of the Home page’s first screen, taller than the other pages’ banners. The title sits over the left part, so keep the subject on the right; narrow screens cut more of the sides. Empty: the built-in picture.',
};

const pageFields: Field[] = [
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
  pageBanner,
  {
    type: 'image',
    name: 'og_image_id',
    label: 'Share picture',
    slot: 'share',
    help: 'Shown when the page is shared. Empty: the Melatec logo picture is used.',
  },
  {
    type: 'bool',
    name: 'noindex',
    label: 'Hide this page from search engines',
    default: false,
  },
];

export const PACKAGE_KINDS = [
  ['single_treatment', 'Dental Packages (single treatments)'],
  ['travel_combo', 'Travel Combos'],
] as const;

/** The legal pages the website has, by address (/privacy-policy, /legal-disclaimer): same list as the table's CHECK. */
export const LEGAL_PAGES = [
  ['privacy-policy', 'Privacy Policy'],
  ['legal-disclaimer', 'Legal Disclaimer'],
] as const;

export const NAV_LOCATIONS = [
  ['utility', 'Top bar (utility link)'],
  ['header', 'Main menu'],
  ['footer_treatment', 'Footer: Treatment'],
  ['footer_explore', 'Footer: Explore'],
  ['footer_legal', 'Footer: legal links'],
] as const;

// The fields of Packages. The photo hint depends on the page the package is shown on (see `fieldsFor`).
const packagePhoto: Field = {
  type: 'image',
  name: 'image_id',
  label: 'Photo',
  slot: 'package-card',
};
const comboPhoto: Field = {
  ...packagePhoto,
  slot: 'combo-card',
  help: 'The name of the combo is written over the top-left corner of the photo.',
};
const packageFields: Field[] = [
  {
    type: 'select',
    name: 'kind',
    label: 'Shown on',
    options: PACKAGE_KINDS,
    default: 'single_treatment',
  },
  {
    type: 'text',
    name: 'title',
    label: 'Name',
    max: 160,
    required: true,
    help: 'For a travel combo, the route, for example “Ha Noi - Da Lat”.',
  },
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
    help: 'Dental Packages: shown as “TOTAL: …”. Travel Combos: shown large, followed by the unit. Leave empty to show no price.',
  },
  {
    type: 'text',
    name: 'price_unit',
    label: 'Price unit',
    max: 40,
    placeholder: 'per person',
    help: 'Travel Combos only: written after the price, for example “$199 per person”. Leave empty for the price alone.',
  },
  {
    type: 'text',
    name: 'price_conditions',
    label: 'Price note',
    max: 400,
    placeholder: 'Flights not included',
    help: 'A short condition shown under the price. Only appears when a price is set.',
  },
  {
    type: 'ref',
    name: 'service_id',
    label: 'Related service',
    table: 'services',
    labelColumn: 'title',
    help: 'Dental Packages only: the card links to this service.',
  },
  packagePhoto,
  sortOrder,
  visible,
];

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
      { field: 'menu_group', label: 'Drop-down' },
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
      {
        type: 'text',
        name: 'menu_group',
        label: 'Drop-down (main menu only)',
        max: MENU_GROUP_MAX,
        placeholder: 'Guides',
        help: 'Links of the main menu with the same drop-down name are shown together under that name, at the place of the first of them. Leave empty for a plain link.',
      },
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
    plural: 'Pages',
    intro:
      'The banner picture at the top of each page, the title and description search engines show, the picture shown when the page is shared, and whether the page is kept out of search engines. Leave a field empty to keep the built-in picture or text. Pages cannot be added or renamed here.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Page' },
      { field: 'path', label: 'Address' },
      { field: 'seo_title', label: 'Search title' },
    ],
    fields: pageFields,
    order: [{ column: 'path' }],
    creatable: false,
    deletable: false,
    // Home's first screen is taller than the other pages' banners, so it asks for a different picture size.
    fieldsFor: (row) =>
      row.path === '/' ? pageFields.map((f) => (f === pageBanner ? homeBanner : f)) : pageFields,
  },
  {
    key: 'services',
    table: 'services',
    singular: 'service',
    plural: 'Services',
    intro:
      'The groups of treatments (Dental Implants, Porcelain Veneers…): the “Services” drop-down of the main menu, the cards of the Services page, a page of its own for each service and the consultation forms. The treatments of a service and their prices are added on the service’s page, under “Treatments”. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Service' },
      { field: 'slug', label: 'Address' },
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
        help: 'The page of the service is /services/<address name>, for example /services/dental-implants (that one has a page written for it).',
      },
      {
        type: 'textarea',
        name: 'summary',
        label: 'Short description',
        max: 400,
        rows: 4,
        help: 'Shown on the Services page card and at the top of the service’s page.',
      },
      {
        type: 'textarea',
        name: 'description',
        label: 'About this service',
        max: 6000,
        rows: 10,
        help: 'Shown on the service’s page under the treatments. Plain text; leave an empty line between paragraphs. Leave empty to show nothing.',
      },
      {
        type: 'text',
        name: 'situations_label',
        label: 'Small heading of “Which treatment fits your situation”',
        max: 120,
        placeholder: 'Implant treatment options',
        help: 'Shown above the situations of this service (added on this page, under “Treatment situations”; the before/after pictures beside them are chosen on the right). Empty: the heading of Page text “Service pages: which treatment fits”.',
      },
      {
        type: 'image',
        name: 'image_id',
        label: 'Photo',
        slot: 'service-card',
        help: 'The card on the Services page.',
      },
      {
        type: 'image',
        name: 'banner_image_id',
        label: 'Banner picture',
        slot: 'page-banner',
        help: 'The wide picture at the top of the service’s page. The title sits over the left part, so keep the subject on the right. Empty: the banner picture of the Services page (Pages).',
      },
      {
        type: 'image',
        name: 'situations_before_image_id',
        label: '“Which treatment fits”: before picture',
        slot: 'treatment-situation',
        help: 'Optional, usually an X-ray: one before/after pair beside all the situation cards of this service. Choose both pictures or neither.',
      },
      {
        type: 'image',
        name: 'situations_after_image_id',
        label: '“Which treatment fits”: after picture',
        slot: 'treatment-situation',
        help: 'Same angle and framing as the before picture.',
      },
      {
        type: 'bool',
        name: 'situations_consent_confirmed',
        label:
          'The patient agreed in writing to show the “Which treatment fits” pictures on the website',
        default: false,
      },
      sortOrder,
      visible,
      {
        type: 'text',
        name: 'seo_title',
        label: 'Search title',
        max: 200,
        group: 'Search engines',
        help: 'Empty: “<name> · Melatec Dental Clinic”.',
      },
      {
        type: 'textarea',
        name: 'seo_description',
        label: 'Search description',
        max: 400,
        rows: 3,
        group: 'Search engines',
        help: 'Empty: the short description.',
      },
    ],
    order: [{ column: 'sort_order' }, { column: 'title' }],
    deletable: true,
  },
  {
    key: 'service-options',
    table: 'service_options',
    singular: 'treatment',
    plural: 'Treatments',
    intro:
      'The treatments of each service (for example All-on-4 under Dental Implants), shown as price cards on the service’s page. Tick “Show on the Home page” for the cards of the Home page. Only fill in what the clinic has confirmed: a price or an included item that is left empty is simply not shown. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Treatment' },
      { field: 'service_id', label: 'Service' },
      { field: 'price_text', label: 'Price' },
      { field: 'show_on_home', label: 'Home page' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'ref',
        name: 'service_id',
        label: 'Service',
        table: 'services',
        labelColumn: 'title',
        required: true,
      },
      { type: 'text', name: 'title', label: 'Name', max: 160, required: true },
      {
        type: 'text',
        name: 'subtitle',
        label: 'Second line',
        max: 160,
        help: 'A short line under the name, for example “Full-arch restoration”. Leave empty for none.',
      },
      {
        type: 'lines',
        name: 'inclusions',
        label: 'What is included',
        maxItems: 8,
        maxLength: 120,
        help: 'One item per line, shown as a list on the card.',
      },
      {
        type: 'text',
        name: 'price_text',
        label: 'Price text',
        max: 120,
        placeholder: 'From $400 per tooth',
        help: 'Shown exactly as written on the card. Leave empty to show no price: the card then invites a quote request.',
      },
      {
        type: 'bool',
        name: 'show_on_home',
        label: 'Show on the Home page',
        default: false,
      },
      sortOrder,
      visible,
    ],
    order: [{ column: 'service_id' }, { column: 'sort_order' }, { column: 'title' }],
    deletable: true,
    parent: { field: 'service_id', entity: 'services' },
  },
  {
    key: 'service-situations',
    table: 'service_situations',
    singular: 'situation',
    plural: 'Treatment situations',
    intro:
      'The numbered “Which treatment fits your situation” cards of each service’s page (for example “One missing tooth: Single Dental Implant & Crown”), numbered in display order. The before/after pictures beside the cards are one pair per service, chosen in the service’s form. Without any situation the block is not shown. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Situation' },
      { field: 'service_id', label: 'Service' },
      { field: 'tag', label: 'Small heading' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'ref',
        name: 'service_id',
        label: 'Service',
        table: 'services',
        labelColumn: 'title',
        required: true,
      },
      {
        type: 'text',
        name: 'tag',
        label: 'Situation',
        max: 60,
        placeholder: 'One missing tooth',
        help: 'The small line above the title, shown in capitals. Leave empty for none.',
      },
      {
        type: 'text',
        name: 'title',
        label: 'Treatment',
        max: 120,
        required: true,
        placeholder: 'Single Dental Implant & Crown',
      },
      {
        type: 'textarea',
        name: 'description',
        label: 'Text',
        max: 600,
        rows: 5,
        help: 'A few sentences on when this treatment is suitable. Treatment information must come from the clinic.',
      },
      sortOrder,
      visible,
    ],
    order: [{ column: 'service_id' }, { column: 'sort_order' }, { column: 'title' }],
    deletable: true,
    parent: { field: 'service_id', entity: 'services' },
  },
  {
    key: 'packages',
    table: 'packages',
    singular: 'package',
    plural: 'Packages',
    intro:
      'The price cards on the Dental Packages page (single treatments) and the Travel Combos page. A price is optional: without one the card shows no price. On Dental Packages, link a package to a service to send visitors to that service; otherwise the card invites them to request a quote. Every Travel Combos card has a “Get a Consultation” button to the consultation form. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Package' },
      { field: 'kind', label: 'Page' },
      { field: 'price_amount', label: 'Price' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: packageFields,
    // A Travel Combos card has a taller picture than a single-treatment card.
    fieldsFor: (row) =>
      row.kind === 'travel_combo'
        ? packageFields.map((f) => (f === packagePhoto ? comboPhoto : f))
        : packageFields,
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
      { type: 'image', name: 'image_id', label: 'Photo', slot: 'location-card' },
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
      { type: 'image', name: 'image_id', label: 'Photo', slot: 'location-card' },
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
      {
        type: 'textarea',
        name: 'description',
        label: 'Description',
        max: 500,
        rows: 3,
        help: 'Shown under the title of the category page and used as its search description.',
      },
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
        help: 'Required to publish. Shown on the article cards, in search results and as the opening lines of the article. One or two sentences.',
      },
      {
        type: 'textarea',
        name: 'body',
        label: 'Article text',
        max: MAX_ARTICLE_BODY,
        rows: 22,
        editor: 'article',
        help: 'Use the buttons above the text, or type: “## Heading” starts a section (listed in the table of contents), “### Heading” a smaller one, “- item” a bullet, “1. item” a numbered point, “> text” a quote, “**bold**” bold text and “[words](https://…)” a link. A blank line starts a new paragraph. Pictures come from Media: use the Picture button.',
      },
      {
        type: 'image',
        name: 'cover_image_id',
        label: 'Cover image',
        slot: 'article-cover',
        help: 'Optional but recommended: the picture of the cards and the top of the article. Without one, the cards show a plain tile.',
      },
      {
        type: 'ref',
        name: 'category_id',
        label: 'Category',
        table: 'article_categories',
        labelColumn: 'name',
      },
      {
        type: 'text',
        name: 'author_name',
        label: 'Written by',
        max: 120,
        group: 'Author and review',
      },
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
      { type: 'text', name: 'seo_title', label: 'Search title', max: 200, group: 'Search engines' },
      { type: 'textarea', name: 'seo_description', label: 'Search description', max: 400, rows: 3 },
      {
        type: 'bool',
        name: 'is_visible',
        label: 'Published (visible on the website after you publish)',
        default: false,
      },
      {
        type: 'bool',
        name: 'show_on_service_pages',
        label: 'Show on the service pages',
        default: false,
        help: 'Listed under the questions of every service page (Dental Implants included), behind the arrow button, newest first. One list for all the services: pick a few useful guides.',
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
    key: 'smile-results',
    table: 'smile_results',
    singular: 'before/after pair',
    plural: 'Smile results',
    intro:
      'Before/after photos of real patients, shown as the “Real Stories. Real Smiles.” slider on every service page (one list for all services). Use two photos of the same patient taken from the same angle. A pair is only shown once you confirm the patient agreed in writing to publish the photos. Changes go live after you publish the website.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Pair' },
      { field: 'consent_confirmed', label: 'Consent' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'text',
        name: 'title',
        label: 'Name (for the admin)',
        max: 160,
        required: true,
        placeholder: 'Implants, upper jaw (2026)',
        help: 'Only shown here, never on the website.',
      },
      {
        type: 'image',
        name: 'before_image_id',
        label: 'Before photo',
        slot: 'smile-result',
        required: true,
        help: 'Shown on the left of the slider.',
      },
      {
        type: 'image',
        name: 'after_image_id',
        label: 'After photo',
        slot: 'smile-result',
        required: true,
        help: 'Shown on the right of the slider. Same angle and framing as the before photo.',
      },
      {
        type: 'bool',
        name: 'consent_confirmed',
        label: 'The patient agreed in writing to show these photos on the website',
        default: false,
      },
      sortOrder,
      visible,
    ],
    order: [{ column: 'sort_order' }, { column: 'title' }],
    deletable: true,
  },
  {
    key: 'faqs',
    table: 'faqs',
    singular: 'question',
    plural: 'FAQs',
    intro:
      'The frequently asked questions of the service pages: one list, shown on every service page (Dental Implants, Porcelain Veneers…). A question without an answer is not shown on the website: answers about treatment must come from the clinic.',
    titleField: 'question',
    columns: [
      { field: 'question', label: 'Question' },
      { field: 'sort_order', label: 'Order' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
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
    order: [{ column: 'sort_order' }, { column: 'question' }],
    deletable: true,
  },
  {
    key: 'legal',
    table: 'legal_pages',
    singular: 'legal page',
    plural: 'Legal pages',
    intro:
      'The Privacy Policy and the Legal Disclaimer. The text must come from the clinic (or its lawyer): nothing is written for you. A page appears on the website, at /privacy-policy or /legal-disclaimer, once it has text, is shown, and the website is published. Then add a link to it under Menu links → “Footer: legal links”.',
    titleField: 'title',
    columns: [
      { field: 'title', label: 'Page' },
      { field: 'slug', label: 'Address' },
      { field: 'is_visible', label: 'Shown' },
    ],
    fields: [
      {
        type: 'select',
        name: 'slug',
        label: 'Which page',
        options: LEGAL_PAGES,
        default: 'privacy-policy',
        help: 'Each page can be added once.',
      },
      { type: 'text', name: 'title', label: 'Title', max: 200, required: true },
      {
        type: 'textarea',
        name: 'body',
        label: 'Text',
        max: MAX_ARTICLE_BODY,
        rows: 24,
        editor: 'text',
        help: 'Use the buttons above the text, or type: “## Heading” starts a section, “- item” a bullet, “1. item” a numbered point, “**bold**” bold text and “[words](https://…)” a link. A blank line starts a new paragraph. Pictures are not used on legal pages.',
      },
      {
        type: 'textarea',
        name: 'seo_description',
        label: 'Search description',
        max: 400,
        rows: 3,
        help: 'Optional. Around 150 characters works well.',
      },
      visible,
    ],
    order: [{ column: 'slug' }],
    deletable: true,
  },
];

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'youtube', 'linkedin'] as const;

/** The single row of site-wide details, edited at /admin/site (not part of the generic list). */
export const SITE_FIELDS: Field[] = [
  {
    type: 'text',
    name: 'site_name',
    group: 'Clinic',
    label: 'Clinic name',
    max: 120,
    required: true,
  },
  { type: 'textarea', name: 'tagline', label: 'Tagline (footer)', max: 300, rows: 3 },
  {
    type: 'text',
    name: 'phone_display',
    group: 'Contact',
    half: true,
    label: 'Phone (as shown)',
    max: 40,
    placeholder: '(+84) 000 000 000',
  },
  {
    type: 'text',
    name: 'phone_intl',
    half: true,
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
    placeholder: 'Monday to Sunday (8:00–20:00)',
  },
  { type: 'text', name: 'copyright_text', group: 'Footer', label: 'Copyright line', max: 200 },
  {
    type: 'ref',
    name: 'intro_video_id',
    label: 'Home page video',
    table: 'media_assets',
    labelColumn: 'alt_text',
    where: { kind: 'video', status: 'active' },
    help: 'Shows the “Watch video” button and a player on the Home page. Use “Choose or upload a video…” to pick one from Media or upload an MP4 here (give it a cover image so people see a picture before pressing play). Choose “None” to show no video.',
  },
  {
    type: 'weburl',
    name: 'intro_video_url',
    label: 'Home page video link (YouTube or Vimeo)',
    max: 300,
    placeholder: 'https://www.youtube.com/watch?v=…',
    help: 'Paste the address of a YouTube or Vimeo video instead of uploading a file. When both a link and an uploaded video are set, the link is shown. Leave empty to use the uploaded video (or none).',
  },
  ...SOCIAL_PLATFORMS.map((p): Field => ({
    group: 'Social profiles',
    half: true,
    type: 'weburl',
    name: `social_${p}`,
    label: `${p[0].toUpperCase()}${p.slice(1)} page`,
    max: 300,
    placeholder: 'https://…',
    help: p === 'facebook' ? 'Leave a link empty to hide its icon.' : undefined,
  })),
];

export const entityByKey = (key: string | undefined) => ENTITIES.find((e) => e.key === key);
