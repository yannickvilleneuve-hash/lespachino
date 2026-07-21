-- Quand le détail LesPAC de ce véhicule a été récupéré pour la dernière fois.
--
-- Le worker refait un `getByListingId` seulement si cette date a dépassé le TTL
-- (CATALOG_DETAIL_TTL_SEC), si l'annonce est inconnue du snapshot, ou si le
-- titre du sommaire a changé. Sinon il réutilise le `payload` déjà stocké.
--
-- NULL = jamais récupéré depuis l'ajout de la colonne: traité comme le plus
-- vieux possible, donc rafraîchi en priorité.
ALTER TABLE public.catalog_vehicle
  ADD COLUMN IF NOT EXISTS detail_fetched_at timestamptz;

-- Le worker trie les candidats au rafraîchissement par date croissante.
CREATE INDEX IF NOT EXISTS catalog_vehicle_detail_fetched_at_idx
  ON public.catalog_vehicle (detail_fetched_at NULLS FIRST);
