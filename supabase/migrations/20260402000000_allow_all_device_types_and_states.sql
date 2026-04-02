-- Remove the restrictive CHECK constraints added in the initial migration.
-- The original schema limited:
--   devices.type  to: light, fan, sensor, switch, plug, thermostat
--   devices.state to: on, off
-- The n8n automation workflows require additional types (AC, curtain, geyser)
-- and additional states (open, closed) for motorised curtains and geysers.

ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS devices_type_check;

ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS devices_state_check;

-- Ensure REPLICA IDENTITY FULL so Supabase Realtime sends full row diffs
ALTER TABLE public.devices REPLICA IDENTITY FULL;

-- Extend Realtime publication to locations and scenes so the dashboard
-- can subscribe to live changes on those tables too.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scenes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
