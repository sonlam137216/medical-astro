import type { FieldErrors, Row } from './fields';

// Rules of the Smile results form (src/lib/cms/entities.ts) that a single field cannot express. The table checks
// the same thing, so a hand-made request cannot get around it either. Pure code, unit-tested.

/** A pair is two different photos. */
export function smileResultErrors(row: Row): FieldErrors {
  const errors: FieldErrors = {};
  if (row.before_image_id && row.before_image_id === row.after_image_id)
    errors.after_image_id = 'Choose a different photo for after.';
  return errors;
}
