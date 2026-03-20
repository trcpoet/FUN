-- Refresh PostgREST schema cache so new tables/functions are visible to the API.
-- Fixes errors like:
-- "Could not find the table public.<table> in the schema cache"
NOTIFY pgrst, 'reload schema';

