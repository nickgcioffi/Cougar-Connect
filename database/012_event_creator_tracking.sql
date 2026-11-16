-- Migration 012: Track which administrator creates each event.
-- Existing events retain NULL when their creator is unknown.

ALTER TABLE public."Events"
ADD COLUMN IF NOT EXISTS "createdBy" uuid
REFERENCES auth.users(id);

-- Automatically record the authenticated event creator.
CREATE OR REPLACE FUNCTION public.set_event_creator()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW."createdBy" := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

-- Allow the migration to be reapplied without duplicating the trigger.
DROP TRIGGER IF EXISTS set_event_creator_on_insert
ON public."Events";

CREATE TRIGGER set_event_creator_on_insert
BEFORE INSERT ON public."Events"
FOR EACH ROW
EXECUTE FUNCTION public.set_event_creator();