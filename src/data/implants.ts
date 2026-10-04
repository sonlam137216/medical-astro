/**
 * Dental Implants landing page (Figma "Melatec / Refined / Dental Implants", 2026-10-04).
 * The Figma file contains the "Treatment options and costs" section twice with identical content;
 * it is rendered once here. "$600" is the price printed in the design: confirm it before publishing.
 */
import type { Img } from './types';
import dentalImplant from '../assets/images/photos/dental-implant.webp';

export const heroImage: Img = {
  src: dentalImplant,
  alt: 'A dental implant with a porcelain crown on a soft white background',
};

export const options = {
  label: 'Treatment costs',
  title: 'Find the right option for your smile',
  body: 'Our team will explain your recommended treatment, inclusions and final estimate.',
  cards: [
    {
      title: 'Single-tooth implant',
      body: 'A solution for replacing an individual missing tooth.',
      price: '$600',
      note: 'Confirm treatment inclusions and your final estimate with our team.',
    },
    {
      title: 'All-on-4 restoration',
      body: 'Full-arch restoration supported by four implants.',
      price: 'Personalised quote',
      note: 'Your estimate depends on your treatment plan and chosen implant system.',
    },
    {
      title: 'All-on-6 restoration',
      body: 'Full-arch restoration supported by six implants.',
      price: 'Personalised quote',
      note: 'Your estimate depends on your treatment plan and chosen implant system.',
    },
  ].map((c) => ({ ...c, image: { src: dentalImplant, alt: '' } satisfies Img })),
};

export const answers = {
  label: 'Before your flight',
  title: 'Clear answers before you travel',
  items: [
    {
      eyebrow: '01',
      title: 'Your treatment options',
      body: 'Discuss the recommended implant treatment and the options available for your case.',
    },
    {
      eyebrow: '02',
      title: 'Your estimated cost',
      body: 'Receive a preliminary estimate and understand what is included in your plan.',
    },
    {
      eyebrow: '03',
      title: 'Your expected timeline',
      body: 'Know how many visits may be needed and the estimated length of each stay.',
    },
  ],
};

export const support = {
  label: 'Dental travel support',
  title: 'Your journey, thoughtfully arranged',
  body: 'Plan your care in Vietnam with support before, during and after your visit.',
  items: [
    {
      eyebrow: '01 / Before you fly',
      title: 'Plan with confidence',
      body: 'Share your dental concerns and available scans. Receive a preliminary treatment plan and estimated cost.',
    },
    {
      eyebrow: '02 / In Vietnam',
      title: 'Feel at home',
      body: 'Get help with airport transport, hotel arrangements and practical information during your stay.',
    },
    {
      eyebrow: '03 / Your treatment',
      title: 'Care around your stay',
      body: 'Discuss your treatment schedule, expected visits and suitable time for exploring Vietnam.',
    },
  ],
};

// The design shows the questions only. Answers must be supplied by the clinic.
export const faq = {
  label: 'Frequently asked questions',
  title: 'A little clarity, a lot more confidence',
  questions: [
    'What should I send before my consultation?',
    'How many visits will my treatment require?',
    'What is included in my estimate?',
    'Can you help with accommodation and transport?',
  ],
};
