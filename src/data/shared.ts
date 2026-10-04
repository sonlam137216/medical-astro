/**
 * Content reused across several Figma pages (Services, Dental Packages, About, Our Doctors).
 * Copied from the Figma file on 2026-10-04. Items marked PLACEHOLDER are dummy values in the design.
 */
import type { Img } from './types';
import dentalImplant from '../assets/images/photos/dental-implant.webp';
import dentalChair from '../assets/images/photos/dental-chair-wide.webp';
import hanoiTower from '../assets/images/photos/hanoi-turtle-tower.webp';
import doctorPortrait from '../assets/images/doctors/doctor-portrait.webp';

export const towerImage: Img = {
  src: hanoiTower,
  alt: 'Hanoi Turtle Tower reflected in the lake at dusk',
};
export const implantImage: Img = {
  src: dentalImplant,
  alt: 'Dental implant on a soft white background',
};

export const tourismSupport = {
  label: 'Dental tourism support',
  title: 'Your Dental Journey in Vietnam, Made Simple',
  items: [
    {
      eyebrow: '01',
      title: 'Airport pickup & transportation',
      body: 'Complimentary airport pickup and local shuttle service between your hotel and the clinic.',
    },
    {
      eyebrow: '02',
      title: 'Hotel & travel assistance',
      body: 'Support with hotel recommendations, booking arrangements and practical travel information during your stay.',
    },
    {
      eyebrow: '03',
      title: 'Local SIM support',
      body: 'Assistance with local SIM setup and essential connectivity so you can stay in touch throughout your trip.',
    },
    {
      eyebrow: '04',
      title: 'Visa assistance',
      body: 'Support with visa information and travel documentation before your trip to Vietnam.',
    },
    {
      eyebrow: '05',
      title: 'Local travel guide',
      body: 'Recommendations for attractions, dining and places to explore during your dental trip in Vietnam.',
    },
    {
      eyebrow: '06',
      title: 'Document assistance',
      body: 'Support with visa documents, insurance paperwork and treatment records.',
    },
  ],
};

export const seamlessJourney = {
  label: 'How it works',
  title: 'Your Seamless Dental Journey in Melatec',
  image: {
    src: dentalChair,
    alt: 'A modern dental treatment room with a dental chair and digital X-ray display',
  } satisfies Img,
};

// PLACEHOLDER: five identical entries in the Figma Services page.
export const serviceDetails = Array.from({ length: 5 }, () => ({
  title: 'Dental Implants',
  body: 'Comprehensive implant solutions, including single-tooth implants, All-on-4 and All-on-6 restorations, using premium implant systems for enhanced safety, stability and long-term function.',
  linkLabel: 'Explore services',
  href: '/services/dental-implants', // PROVISIONAL
  image: implantImage,
}));

// PLACEHOLDER: six identical cards, Vietnamese blurb and "600$" are dummy values in the design.
export const packageCards = Array.from({ length: 6 }, () => ({
  title: 'Dental Implants',
  inclusions: Array.from({ length: 4 }, () => 'Chi phí thấp hơn, chất lượng dịch vụ không đổi'),
  total: 'TOTAL: 600$',
  href: '/services/dental-implants', // PROVISIONAL
  image: implantImage,
}));

export const doctorProfiles = [
  {
    name: 'Dr. Pham Truong Son',
    role: 'Orthodontist & Implantologist',
    bio: 'A graduate of Hanoi Medical University, Dr. Pham Truong Son brings more than 15 years of clinical experience in dentistry. With a strong professional foundation and a patient-centred approach, he has earned the trust of patients throughout his career, successfully completing more than 2,000 restorative and orthodontic cases.',
    credentials: [
      'Doctor of Dentistry – Hanoi Medical University',
      'Advanced Certification in Orthodontics & Implant Dentistry',
      'Licensed Dental Practitioner, certified by the Ministry of Health',
      '15+ years of clinical experience with over 2,000 successful restorative and orthodontic cases',
    ],
  },
  {
    name: 'Dr. Tran Van Truong',
    role: 'Implantologist',
    bio: 'A graduate of Hanoi Medical University, Dr. Tran Van Truong specialises in Implant Dentistry with advanced training in implant placement, bone grafting and sinus lift procedures. Dr. Truong has successfully completed nearly 1,000 dental implant cases, delivering personalised treatment plans for each patient.',
    credentials: [
      'Doctor of Dentistry – Hanoi Medical University',
      'Completed professional training in Dental Implantology, Bone Grafting & Sinus Lift Procedures',
      'Regularly participates in Continuing Medical Education (CME) and professional training in Vietnam and abroad',
    ],
  },
  {
    name: 'Dr. Le Thi Yen',
    role: 'Orthodontist & Implantologist',
    bio: 'A Specialist Level I in Odonto-Stomatology from Hai Phong University of Medicine and Pharmacy, Dr. Le Thi Yen has a strong professional foundation with particular expertise in dentofacial orthopedics and advanced implant dentistry.',
    credentials: [
      'Doctor of Medicine – Thai Binh University of Medicine and Pharmacy',
      'Certified in Dentofacial Orthopedics (Orthodontics)',
      'Certified in Dental Implantology',
      'Licensed Dental Practitioner in Odonto-Stomatology, certified by the Ministry of Health',
    ],
  },
  {
    name: 'Dr. Nguyen Ngoc Quang',
    role: 'Orthodontist & Implantologist',
    bio: 'A graduate in Odonto-Stomatology from Hue University of Medicine and Pharmacy, Dr. Nguyen Ngoc Quang has extensive advanced training in cosmetic dentistry. He is known for his professional, attentive and gentle approach, helping patients feel comfortable and reassured throughout treatment.',
    credentials: [
      'Doctor of Odonto-Stomatology – Hue University of Medicine and Pharmacy',
      'Undertook several years of advanced training in Cosmetic Dentistry',
      'Licensed Dental Practitioner in Odonto-Stomatology, certified by the Ministry of Health',
    ],
  },
].map((d) => ({
  ...d,
  image: { src: doctorPortrait, alt: `Portrait of ${d.name}` } satisfies Img,
})); // PLACEHOLDER: one portrait for all
