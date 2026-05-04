ALTER TABLE public.listing
  DROP CONSTRAINT IF EXISTS listing_channels_valid;

ALTER TABLE public.listing
  ADD CONSTRAINT listing_channels_valid
  CHECK (
    coalesce(channels, '{}'::text[]) <@ ARRAY[
      'native',
      'wix',
      'fb_marketplace',
      'fb_page',
      'google_vla',
      'lespac',
      'kijiji',
      'truckpaper',
      'marketbook'
    ]::text[]
  );
