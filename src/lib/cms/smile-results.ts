import type { FieldErrors, Row } from './fields';

// Rules of the Smile results form (src/lib/cms/entities.ts) that a single field cannot express. The table checks
// the same two things, so a hand-made request cannot get around them either. Pure code, unit-tested.

/** A shown pair needs the patient's written consent, and two different photos. */
export function smileResultErrors(row: Row): FieldErrors {
  const errors: FieldErrors = {};
  if (row.is_visible === true && row.consent_confirmed !== true)
    errors.consent_confirmed =
      'Confirm the patient’s written consent before showing the photos, or untick “Show on the website”.';
  if (row.before_image_id && row.before_image_id === row.after_image_id)
    errors.after_image_id = 'Choose a different photo for after.';
  return errors;
}
