-- What the price of a package is for ("per person"), shown after the amount on the Travel Combos cards
-- ("$199 per person"); empty: the amount alone.
alter table packages add column price_unit text check (length(price_unit) <= 40);
