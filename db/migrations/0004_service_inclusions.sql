-- Short "what is included" lines shown on the service cards (Home), as a JSON array of text.
-- Empty by default: nothing is invented for a service until the clinic provides it.
alter table services add column inclusions text not null default '[]' check (json_valid(inclusions) and json_type(inclusions) = 'array' and json_array_length(inclusions) <= 12);
