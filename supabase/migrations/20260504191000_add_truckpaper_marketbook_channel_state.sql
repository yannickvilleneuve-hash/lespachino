ALTER TABLE public.listing_channel_state
  DROP CONSTRAINT IF EXISTS listing_channel_state_channel_valid;

ALTER TABLE public.listing_channel_state
  ADD CONSTRAINT listing_channel_state_channel_valid
  CHECK (
    channel IN (
      'native',
      'fb_marketplace',
      'fb_page',
      'google_vla',
      'lespac',
      'kijiji',
      'wix',
      'truckpaper',
      'marketbook'
    )
  );
