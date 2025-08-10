-- Enable required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to auto-update updated_at columns
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) locations table
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) devices table
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'off',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) sensor_events table
CREATE TABLE IF NOT EXISTS public.sensor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) scenes table
CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_name TEXT NOT NULL,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  desired_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_locations_updated_at'
  ) THEN
    CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON public.locations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_devices_updated_at'
  ) THEN
    CREATE TRIGGER trg_devices_updated_at
    BEFORE UPDATE ON public.devices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sensor_events_updated_at'
  ) THEN
    CREATE TRIGGER trg_sensor_events_updated_at
    BEFORE UPDATE ON public.sensor_events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_scenes_updated_at'
  ) THEN
    CREATE TRIGGER trg_scenes_updated_at
    BEFORE UPDATE ON public.scenes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;

-- Enable Row Level Security
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

-- Policies
-- Public read access for all tables (dashboard viewing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'Public can read locations'
  ) THEN
    CREATE POLICY "Public can read locations" ON public.locations FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'Public can read devices'
  ) THEN
    CREATE POLICY "Public can read devices" ON public.devices FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'Public can read sensor_events'
  ) THEN
    CREATE POLICY "Public can read sensor_events" ON public.sensor_events FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'Public can read scenes'
  ) THEN
    CREATE POLICY "Public can read scenes" ON public.scenes FOR SELECT USING (true);
  END IF;
END$$;

-- Allow public updates to devices.state so toggles work without auth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'Public can update devices'
  ) THEN
    CREATE POLICY "Public can update devices" ON public.devices FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Optional indexes
CREATE INDEX IF NOT EXISTS idx_devices_location_id ON public.devices(location_id);
CREATE INDEX IF NOT EXISTS idx_sensor_events_device_id ON public.sensor_events(device_id);
CREATE INDEX IF NOT EXISTS idx_scenes_device_id ON public.scenes(device_id);
