// Row shapes as the application sees them (booleans, arrays and objects already converted from the
// SQLite storage form). Keep in sync with db/migrations: tests/db-schema.test.ts fails when they drift.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Tables {
  article_categories: {
    Row: {
      created_at: string;
      id: string;
      is_visible: boolean;
      kind: string;
      name: string;
      slug: string;
      sort_order: number;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      id?: string;
      is_visible?: boolean;
      kind: string;
      name: string;
      slug: string;
      sort_order?: number;
      updated_at?: string;
    };
  };
  articles: {
    Row: {
      author_name: string | null;
      body: string | null;
      category_id: string | null;
      cover_image_id: string | null;
      created_at: string;
      destination_id: string | null;
      excerpt: string | null;
      id: string;
      is_visible: boolean;
      kind: string;
      published_on: string | null;
      reviewed_by: string | null;
      reviewed_on: string | null;
      seo_description: string | null;
      seo_title: string | null;
      slug: string;
      title: string;
      updated_at: string;
    };
    Insert: {
      author_name?: string | null;
      body?: string | null;
      category_id?: string | null;
      cover_image_id?: string | null;
      created_at?: string;
      destination_id?: string | null;
      excerpt?: string | null;
      id?: string;
      is_visible?: boolean;
      kind: string;
      published_on?: string | null;
      reviewed_by?: string | null;
      reviewed_on?: string | null;
      seo_description?: string | null;
      seo_title?: string | null;
      slug: string;
      title: string;
      updated_at?: string;
    };
  };
  audit_logs: {
    Row: {
      action: string;
      actor_id: string | null;
      at: string;
      changes: Json | null;
      id: number;
      row_id: string | null;
      table_name: string;
    };
    Insert: {
      action: string;
      actor_id?: string | null;
      at?: string;
      changes?: Json | null;
      id?: never;
      row_id?: string | null;
      table_name: string;
    };
  };
  consultation_requests: {
    Row: {
      client_country: string | null;
      created_at: string;
      email: string;
      full_name: string;
      handled_at: string | null;
      handled_by: string | null;
      id: string;
      internal_note: string | null;
      phone: string;
      service_interest: string | null;
      source_path: string | null;
      status: string;
      submission_id: string;
      updated_at: string;
    };
    Insert: {
      client_country?: string | null;
      created_at?: string;
      email: string;
      full_name: string;
      handled_at?: string | null;
      handled_by?: string | null;
      id?: string;
      internal_note?: string | null;
      phone: string;
      service_interest?: string | null;
      source_path?: string | null;
      status?: string;
      submission_id: string;
      updated_at?: string;
    };
  };
  content_revisions: {
    Row: {
      content_hash: string;
      created_at: string;
      created_by: string | null;
      id: string;
      note: string | null;
      revision_number: number;
      snapshot: NonNullable<Json>;
      snapshot_schema_version: number;
    };
    Insert: {
      content_hash: string;
      created_at?: string;
      created_by?: string | null;
      id?: string;
      note?: string | null;
      revision_number?: never;
      snapshot: NonNullable<Json>;
      snapshot_schema_version?: number;
    };
  };
  destinations: {
    Row: {
      created_at: string;
      id: string;
      image_id: string | null;
      is_visible: boolean;
      name: string;
      slug: string;
      sort_order: number;
      summary: string | null;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      id?: string;
      image_id?: string | null;
      is_visible?: boolean;
      name: string;
      slug: string;
      sort_order?: number;
      summary?: string | null;
      updated_at?: string;
    };
  };
  doctor_services: {
    Row: {
      doctor_id: string;
      service_id: string;
    };
    Insert: {
      doctor_id: string;
      service_id: string;
    };
  };
  doctors: {
    Row: {
      bio: string | null;
      created_at: string;
      credentials: string[];
      full_name: string;
      id: string;
      image_id: string | null;
      is_visible: boolean;
      languages: string[];
      role_title: string | null;
      slug: string;
      sort_order: number;
      updated_at: string;
    };
    Insert: {
      bio?: string | null;
      created_at?: string;
      credentials?: string[];
      full_name: string;
      id?: string;
      image_id?: string | null;
      is_visible?: boolean;
      languages?: string[];
      role_title?: string | null;
      slug: string;
      sort_order?: number;
      updated_at?: string;
    };
  };
  faqs: {
    Row: {
      answer: string | null;
      created_at: string;
      group_key: string;
      id: string;
      is_visible: boolean;
      question: string;
      sort_order: number;
      updated_at: string;
    };
    Insert: {
      answer?: string | null;
      created_at?: string;
      group_key: string;
      id?: string;
      is_visible?: boolean;
      question: string;
      sort_order?: number;
      updated_at?: string;
    };
  };
  locations: {
    Row: {
      address_line: string | null;
      created_at: string;
      directions_url: string | null;
      id: string;
      image_id: string | null;
      is_visible: boolean;
      name: string;
      slug: string;
      sort_order: number;
      updated_at: string;
    };
    Insert: {
      address_line?: string | null;
      created_at?: string;
      directions_url?: string | null;
      id?: string;
      image_id?: string | null;
      is_visible?: boolean;
      name: string;
      slug: string;
      sort_order?: number;
      updated_at?: string;
    };
  };
  media_assets: {
    Row: {
      alt_text: string | null;
      created_at: string;
      height: number | null;
      id: string;
      is_decorative: boolean;
      kind: string;
      mime_type: string;
      poster_asset_id: string | null;
      r2_key: string;
      size_bytes: number;
      status: string;
      updated_at: string;
      variant_widths: number[];
      width: number | null;
    };
    Insert: {
      alt_text?: string | null;
      created_at?: string;
      height?: number | null;
      id?: string;
      is_decorative?: boolean;
      kind: string;
      mime_type: string;
      poster_asset_id?: string | null;
      r2_key: string;
      size_bytes: number;
      status?: string;
      updated_at?: string;
      variant_widths?: number[];
      width?: number | null;
    };
  };
  navigation_items: {
    Row: {
      created_at: string;
      href: string;
      id: string;
      is_visible: boolean;
      label: string;
      location: string;
      sort_order: number;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      href: string;
      id?: string;
      is_visible?: boolean;
      label: string;
      location: string;
      sort_order?: number;
      updated_at?: string;
    };
  };
  package_items: {
    Row: {
      created_at: string;
      id: string;
      label: string;
      package_id: string;
      sort_order: number;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      id?: string;
      label: string;
      package_id: string;
      sort_order?: number;
      updated_at?: string;
    };
  };
  packages: {
    Row: {
      created_at: string;
      currency: string | null;
      description: string | null;
      id: string;
      image_id: string | null;
      is_visible: boolean;
      kind: string;
      price_amount: number | null;
      price_conditions: string | null;
      service_id: string | null;
      slug: string;
      sort_order: number;
      title: string;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      currency?: string | null;
      description?: string | null;
      id?: string;
      image_id?: string | null;
      is_visible?: boolean;
      kind: string;
      price_amount?: number | null;
      price_conditions?: string | null;
      service_id?: string | null;
      slug: string;
      sort_order?: number;
      title: string;
      updated_at?: string;
    };
  };
  page_sections: {
    Row: {
      created_at: string;
      data: NonNullable<Json>;
      data_version: number;
      id: string;
      is_visible: boolean;
      page_id: string;
      sort_order: number;
      type: string;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      data?: NonNullable<Json>;
      data_version?: number;
      id?: string;
      is_visible?: boolean;
      page_id: string;
      sort_order?: number;
      type: string;
      updated_at?: string;
    };
  };
  pages: {
    Row: {
      created_at: string;
      id: string;
      is_enabled: boolean;
      noindex: boolean;
      og_image_id: string | null;
      path: string;
      seo_description: string | null;
      seo_title: string | null;
      title: string;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      id?: string;
      is_enabled?: boolean;
      noindex?: boolean;
      og_image_id?: string | null;
      path: string;
      seo_description?: string | null;
      seo_title?: string | null;
      title: string;
      updated_at?: string;
    };
  };
  publish_jobs: {
    Row: {
      created_at: string;
      deploy_ref: string | null;
      error: string | null;
      finished_at: string | null;
      id: string;
      queued_at: string;
      requested_by: string | null;
      revision_id: string;
      started_at: string | null;
      status: string;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      deploy_ref?: string | null;
      error?: string | null;
      finished_at?: string | null;
      id?: string;
      queued_at?: string;
      requested_by?: string | null;
      revision_id: string;
      started_at?: string | null;
      status?: string;
      updated_at?: string;
    };
  };
  redirects: {
    Row: {
      created_at: string;
      from_path: string;
      id: string;
      status_code: number;
      to_path: string;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      from_path: string;
      id?: string;
      status_code?: number;
      to_path: string;
      updated_at?: string;
    };
  };
  services: {
    Row: {
      created_at: string;
      description: string | null;
      id: string;
      image_id: string | null;
      is_visible: boolean;
      price_text: string | null;
      seo_description: string | null;
      seo_title: string | null;
      slug: string;
      sort_order: number;
      summary: string | null;
      title: string;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      description?: string | null;
      id?: string;
      image_id?: string | null;
      is_visible?: boolean;
      price_text?: string | null;
      seo_description?: string | null;
      seo_title?: string | null;
      slug: string;
      sort_order?: number;
      summary?: string | null;
      title: string;
      updated_at?: string;
    };
  };
  site_settings: {
    Row: {
      address_line: string | null;
      contact_email: string | null;
      copyright_text: string | null;
      default_og_image_id: string | null;
      id: number;
      intro_video_id: string | null;
      logo_asset_id: string | null;
      logo_light_asset_id: string | null;
      opening_hours: string | null;
      phone_display: string | null;
      phone_intl: string | null;
      site_name: string;
      social_links: NonNullable<Json>;
      tagline: string | null;
      updated_at: string;
      whatsapp_url: string | null;
    };
    Insert: {
      address_line?: string | null;
      contact_email?: string | null;
      copyright_text?: string | null;
      default_og_image_id?: string | null;
      id?: number;
      intro_video_id?: string | null;
      logo_asset_id?: string | null;
      logo_light_asset_id?: string | null;
      opening_hours?: string | null;
      phone_display?: string | null;
      phone_intl?: string | null;
      site_name: string;
      social_links?: NonNullable<Json>;
      tagline?: string | null;
      updated_at?: string;
      whatsapp_url?: string | null;
    };
  };
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]['Row'];
export type InsertRow<T extends TableName> = Tables[T]['Insert'];

/**
 * What the query layer (db.ts) must know about each table, because SQLite stores booleans as 0/1 and
 * arrays/objects as JSON text.
 *  - bool / json: columns converted on read and write.
 *  - uuid: `id` is a UUID the application generates on insert (so the audit row can name it).
 *  - audit: false = not audited; a list = only these columns are written to the audit log (used for tables
 *    holding personal data or very large values); absent = every changed column.
 *  - refs: many-to-one links that `select('alias:table(cols)')` may follow.
 * `admins` and `admin_sessions` are deliberately absent: only src/lib/admin-auth.ts touches them, with raw SQL.
 */
export interface TableInfo {
  bool?: readonly string[];
  json?: readonly string[];
  uuid?: boolean;
  audit?: false | readonly string[];
  refs?: Record<string, TableName>;
}

export const TABLES: Record<TableName, TableInfo> = {
  article_categories: { bool: ['is_visible'], uuid: true },
  articles: {
    bool: ['is_visible'],
    uuid: true,
    refs: { category_id: 'article_categories', cover_image_id: 'media_assets' },
    // The body can be tens of kilobytes: the audit log records the other columns only.
    audit: [
      'slug',
      'kind',
      'title',
      'excerpt',
      'category_id',
      'cover_image_id',
      'author_name',
      'reviewed_by',
      'reviewed_on',
      'published_on',
      'seo_title',
      'seo_description',
      'is_visible',
    ],
  },
  audit_logs: { json: ['changes'], audit: false },
  consultation_requests: {
    uuid: true,
    // Personal data never goes into the audit log: only where the request came from and how it was handled.
    audit: ['source_path', 'status'],
  },
  content_revisions: {
    json: ['snapshot'],
    uuid: true,
    audit: ['content_hash', 'note', 'snapshot_schema_version'],
  },
  destinations: { bool: ['is_visible'], uuid: true },
  doctor_services: { audit: false },
  doctors: {
    bool: ['is_visible'],
    json: ['credentials', 'languages'],
    uuid: true,
    refs: { image_id: 'media_assets' },
  },
  faqs: { bool: ['is_visible'], uuid: true },
  locations: { bool: ['is_visible'], uuid: true },
  media_assets: { bool: ['is_decorative'], json: ['variant_widths'], uuid: true },
  navigation_items: { bool: ['is_visible'], uuid: true },
  package_items: { uuid: true },
  packages: { bool: ['is_visible'], uuid: true },
  page_sections: { bool: ['is_visible'], json: ['data'], uuid: true },
  pages: { bool: ['noindex', 'is_enabled'], uuid: true },
  publish_jobs: { uuid: true, refs: { revision_id: 'content_revisions' } },
  redirects: { uuid: true },
  services: { bool: ['is_visible'], uuid: true },
  site_settings: { json: ['social_links'] },
};
