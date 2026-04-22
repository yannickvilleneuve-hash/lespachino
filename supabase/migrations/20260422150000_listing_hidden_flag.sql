-- Drapeau "caché de la liste" — le véhicule reste dans SERTI/Merlin
-- (source de vérité), mais disparaît de notre inventaire UI.
ALTER TABLE public.listing
  ADD COLUMN hidden boolean NOT NULL DEFAULT false;

CREATE INDEX listing_hidden_idx ON public.listing(hidden) WHERE hidden = true;
