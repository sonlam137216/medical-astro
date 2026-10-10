-- Short "what is included" lines shown on the package cards, as a JSON array of text (same shape as services).
-- Empty by default: nothing is invented for a package until the clinic provides it.
alter table packages add column inclusions text not null default '[]' check (json_valid(inclusions) and json_type(inclusions) = 'array' and json_array_length(inclusions) <= 12);
