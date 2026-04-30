-- Étend l'ensemble des canaux trackés par listing_channel_state.
-- - fb_marketplace : feed Meta Commerce Manager (Marketplace + Pages catalogue)
-- - fb_page        : post natif sur la Page Facebook (différent du catalogue)
-- - google_vla     : feed Google Vehicle Listings Ads
ALTER TABLE public.listing_channel_state
  DROP CONSTRAINT listing_channel_state_channel_valid;

ALTER TABLE public.listing_channel_state
  ADD CONSTRAINT listing_channel_state_channel_valid
  CHECK (channel IN ('native','fb_marketplace','fb_page','google_vla','lespac','kijiji','wix'));
