-- MVP stage 4: smithy crafting. Learned recipes are ids from
-- packages/shared/src/data/recipes.ts, in the order they were learned.
ALTER TABLE characters ADD COLUMN recipes text[] NOT NULL DEFAULT '{}';
