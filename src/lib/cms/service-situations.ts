import type { FieldErrors, Row } from './fields';

// Rules of the treatment situations form (src/lib/cms/entities.ts) that a single field cannot express. The table
// checks the same things, so a hand-made request cannot get around them either. Pure code, unit-tested.

/** The pictures are a pair of two different photos, and a shown pair needs the patient's written consent. */
export function situationErrors(row: Row): FieldErrors {
  const errors: FieldErrors = {};
  const before = row.before_image_id || null;
  const after = row.after_image_id || null;
  if (before && !after)
    errors.after_image_id = 'Choose the after picture too, or remove the before picture.';
  else if (after && !before)
    errors.before_image_id = 'Choose the before picture too, or remove the after picture.';
  else if (before && before === after)
    errors.after_image_id = 'Choose a different picture for after.';
  if (before && after && row.is_visible === true && row.consent_confirmed !== true)
    errors.consent_confirmed =
      'Confirm the patient’s written consent before showing the pictures, or untick “Show on the website”.';
  return errors;
}
