import type { FieldErrors, Row } from './fields';
import { bodyImageIds, parseArticleBody } from './articles.ts';

// Rules of the Smile stories form (src/lib/cms/entities.ts) that a single field cannot express. The table checks
// the two pictures too, so a hand-made request cannot get around it. Pure code, unit-tested.

/** The longest story (the table checks the same). It sits beside the photos, so it is meant to be short. */
export const MAX_SMILE_STORY = 3000;

export const STORY_PICTURE_ERROR =
  'Pictures cannot go in the story: the before/after photos are chosen on the right.';

/** A slide is two different photos, and its text has no pictures of its own. */
export function smileStoryErrors(row: Row): FieldErrors {
  const errors: FieldErrors = {};
  if (row.before_image_id && row.before_image_id === row.after_image_id)
    errors.after_image_id = 'Choose a different photo for after.';
  if (typeof row.body === 'string' && bodyImageIds(parseArticleBody(row.body)).length > 0)
    errors.body = STORY_PICTURE_ERROR;
  return errors;
}
