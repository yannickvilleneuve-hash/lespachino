-- Rendre le bucket vehicle-photos lisible en anon pour le catalogue public
-- + feeds multi-canal. Les URLs stables bypass Supabase auth:
--   https://<ref>.supabase.co/storage/v1/object/public/vehicle-photos/<unit>/<uuid>.jpg
UPDATE storage.buckets SET public = true WHERE id = 'vehicle-photos';

CREATE POLICY vehicle_photos_public_read ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'vehicle-photos');
