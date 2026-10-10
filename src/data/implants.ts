/**
 * Dental Implants page (Figma "General Service Template", new file of 2026-10-10; the page doubles as the
 * service template, but only this one route exists until the services CMS (A1) is built).
 * The Figma file shows sample data in several places (3 identical price cards with Vietnamese bullets,
 * 6 identical "Experienced team" cards, 4 identical FAQ questions, a before/after carousel of one real
 * patient). Those are replaced by the copy kept from the previous design below or left out; every figure
 * and claim here must be confirmed by the clinic before launch.
 */
import type { Img } from './types';
import dentalImplant from '../assets/images/photos/dental-implant.webp';
import implantHero from '../assets/images/photos/implant-hero.webp';

export const heroImage: Img = {
  src: implantHero,
  alt: 'Illustration of a dental implant with a porcelain crown beside natural teeth',
};

export const hero = {
  label: 'Dental implants. Melatec Dental Clinic',
  title: 'Save more on implant treatment, get your plan before you fly',
  body: 'Comprehensive implant solutions, including single-tooth implants, All-on-4 and All-on-6 restorations, using premium implant systems for enhanced safety, stability and long-term function.',
};

export const costs = {
  label: 'Treatment costs',
  title: 'What You Pay at Melatec',
  // "$600" is the price printed in the design: confirm it before publishing.
  cards: [
    {
      title: 'Single-tooth implant',
      inclusions: [
        'A solution for replacing an individual missing tooth.',
        'Confirm treatment inclusions and your final estimate with our team.',
      ],
      total: 'TOTAL: $600',
    },
    {
      title: 'All-on-4 restoration',
      inclusions: [
        'Full-arch restoration supported by four implants.',
        'Your estimate depends on your treatment plan and chosen implant system.',
      ],
      total: 'Personalised quote',
    },
    {
      title: 'All-on-6 restoration',
      inclusions: [
        'Full-arch restoration supported by six implants.',
        'Your estimate depends on your treatment plan and chosen implant system.',
      ],
      total: 'Personalised quote',
    },
  ].map((c) => ({ ...c, image: { src: dentalImplant, alt: '' } satisfies Img })),
};

export const comparison = {
  label: 'Cost comparison',
  title: 'Compared with Other Countries',
  rows: [
    { name: 'Single implant, fixture only', note: 'Abutment and crown quoted separately.' },
    { name: 'All-on-4, per arch', note: 'Four implants plus the fixed bridge.' },
    { name: 'All-on-6, per arch', note: 'Six implants plus the fixed bridge.' },
  ],
};

// Six cards: the "Clear answers" and "Dental travel support" copy of the previous design stands in for the
// six identical "Experienced team" placeholders of the Figma file.
export const why = {
  label: 'Why Melatec Dental Clinic',
  title: 'High-Quality Implant Care at a Smarter Cost',
  items: [
    {
      title: 'Your treatment options',
      body: 'Discuss the recommended implant treatment and the options available for your case.',
    },
    {
      title: 'Your estimated cost',
      body: 'Receive a preliminary estimate and understand what is included in your plan.',
    },
    {
      title: 'Your expected timeline',
      body: 'Know how many visits may be needed and the estimated length of each stay.',
    },
    {
      title: 'Plan with confidence',
      body: 'Share your dental concerns and available scans. Receive a preliminary treatment plan and estimated cost.',
    },
    {
      title: 'Feel at home',
      body: 'Get help with airport transport, hotel arrangements and practical information during your stay.',
    },
    {
      title: 'Care around your stay',
      body: 'Discuss your treatment schedule, expected visits and suitable time for exploring Vietnam.',
    },
  ],
};

export const plan = {
  label: 'Get your treatment plan & estimate',
  title: 'Get Your Implant Plan Before Your Flight',
  body: 'Share your dental concerns and, if available, recent X-rays or CT scans. Our dental team will review your case and provide a preliminary treatment plan and estimated cost before your flight to Vietnam.',
  bullets: [
    'Receive a personalised treatment plan and estimated cost before your flight.',
    'Understand your recommended implant treatment, options and expected timeline.',
    'Know how many visits may be required and the estimated length of each stay.',
  ],
};

// The design shows the questions only. Answers must be supplied by the clinic.
export const faq = {
  label: 'FAQs',
  title: 'Frequently Asked Questions',
  questions: [
    'What should I send before my consultation?',
    'How many visits will my treatment require?',
    'What is included in my estimate?',
    'Can you help with accommodation and transport?',
  ],
};
