// Country-code choices for the phone field. Most patients come from the countries listed in the design
// ("Australia · USA · UK · France · Japan · Korea") plus Vietnam, so those are first. Kept short on purpose.
export const phoneCodes = [
  { code: '+84', label: 'VN +84', name: 'Vietnam' },
  { code: '+61', label: 'AU +61', name: 'Australia' },
  { code: '+1', label: 'US/CA +1', name: 'United States / Canada' },
  { code: '+44', label: 'UK +44', name: 'United Kingdom' },
  { code: '+33', label: 'FR +33', name: 'France' },
  { code: '+81', label: 'JP +81', name: 'Japan' },
  { code: '+82', label: 'KR +82', name: 'South Korea' },
  { code: '+64', label: 'NZ +64', name: 'New Zealand' },
  { code: '+49', label: 'DE +49', name: 'Germany' },
  { code: '+65', label: 'SG +65', name: 'Singapore' },
  { code: '+66', label: 'TH +66', name: 'Thailand' },
  { code: '+86', label: 'CN +86', name: 'China' },
] as const;
