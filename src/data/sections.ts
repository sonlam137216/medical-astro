/**
 * The built-in text of every editable page section (see src/lib/cms/sections.ts), gathered in one place. A section
 * shows this text until somebody edits it in the admin ("Page text"); the admin form starts from it too. Each value
 * has the fields of the section's form, plus whatever the admin cannot edit (pictures, numbers).
 */
import {
  hero as homeHero,
  servicesHeading,
  patientSupport,
  conversations,
  costComparison,
  whyMelatec,
  insideClinic as homeInside,
  doctors as homeDoctors,
  howItWorks,
  smileStories,
  travelGuide,
} from './home';
import {
  aboutHero,
  stats,
  personalisedCare,
  whyChoose,
  insideClinic as aboutInside,
} from './about';
import {
  hero as implantsHero,
  costs as implantsCosts,
  comparison as implantsComparison,
  why as implantsWhy,
  plan as implantsPlan,
  faq as implantsFaq,
} from './implants';
import {
  servicesHero,
  doctorsHero,
  packagesHero,
  combosHero,
  tourismSupport,
  seamlessJourney,
} from './shared';

/** One row of a cost table. Built-in rows have no figures of their own: the table shows placeholders. */
export interface CostRow {
  name: string;
  note: string;
  cells?: string[];
  saving?: string;
}

export const SECTION_SAMPLES = {
  home_hero: homeHero,
  home_support: { items: patientSupport },
  home_services: servicesHeading,
  home_costs: {
    label: costComparison.label,
    title: costComparison.title,
    rows: costComparison.rows as CostRow[],
    methodology: '',
  },
  home_conversations: conversations,
  home_why: whyMelatec,
  home_inside: homeInside,
  home_doctors: homeDoctors,
  home_how: howItWorks,
  home_smile: smileStories,
  home_travel: travelGuide,
  about_hero: aboutHero,
  about_stats: { items: stats },
  about_care: personalisedCare,
  about_why: whyChoose,
  about_inside: aboutInside,
  services_hero: servicesHero,
  shared_tourism: tourismSupport,
  shared_journey: seamlessJourney,
  doctors_hero: doctorsHero,
  packages_hero: packagesHero,
  combos_hero: combosHero,
  implants_hero: implantsHero,
  implants_costs: implantsCosts,
  implants_comparison: {
    label: implantsComparison.label,
    title: implantsComparison.title,
    rows: implantsComparison.rows as CostRow[],
    methodology: '',
  },
  implants_why: implantsWhy,
  implants_plan: implantsPlan,
  implants_faq: implantsFaq,
};

export type SectionKey = keyof typeof SECTION_SAMPLES;
