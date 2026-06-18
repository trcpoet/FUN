-- Scoping avatars_public_read to authenticated (migration 20260618080000) did NOT
-- clear the public_bucket_allows_listing advisor: any listing policy on a public
-- bucket still permits enumeration (anyone can sign up → "authenticated" ≈ public).
-- The app reads avatars only via getPublicUrl() (public CDN, RLS-exempt) and uploads
-- via authenticated .upload(); it never calls storage.list(). So the SELECT/list
-- policy is unused — drop it entirely. Public avatar downloads + uploads are unaffected;
-- files are now reachable only by direct URL, not enumerable.
drop policy if exists "avatars_public_read" on storage.objects;
