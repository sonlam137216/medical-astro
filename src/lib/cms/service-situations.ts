import type { FieldErrors, Row } from './fields';

// Rules of the "Which treatment fits your situation" pictures of a service (the Services form, src/lib/cms/
// entities.ts) that a single field cannot express. The table checks the same things, so a hand-made request cannot
// get around them either. Pure code, unit-tested.

/** The pictures are a pair of two different photos, and chosen pictures need the patient's written consent. */
export function situationPictureErrors(row: Row): FieldErrors {
  const errors: FieldErrors = {};
  const before = row.situations_before_image_id || null;
  const after = row.situations_after_image_id || null;
  if (before && !after)
    errors.situations_after_image_id =
      'Choose the after picture too, or remove the before picture.';
  else if (after && !before)
    errors.situations_before_image_id =
      'Choose the before picture too, or remove the after picture.';
  else if (before && before === after)
    errors.situations_after_image_id = 'Choose a different picture for after.';
  if (before && after && row.situations_consent_confirmed !== true)
    errors.situations_consent_confirmed =
      'Confirm the patient’s written consent before showing the pictures, or remove them.';
  return errors;
}
