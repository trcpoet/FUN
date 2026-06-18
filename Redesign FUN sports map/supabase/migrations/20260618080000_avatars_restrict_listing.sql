-- Advisor public_bucket_allows_listing (avatars bucket): the public-role SELECT
-- policy let anyone enumerate every avatar object in the public 'avatars' bucket.
-- The app reads avatars only via getPublicUrl() (public CDN, RLS-exempt) and uploads
-- via authenticated .upload(); it never calls storage.list(). So scoping this
-- list/read policy to the authenticated role stops anonymous enumeration without
-- affecting avatar display (public URLs) or uploads.
alter policy "avatars_public_read" on storage.objects to authenticated;
