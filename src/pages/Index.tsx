import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DeviceCard, type Device } from "@/components/devices/DeviceCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { triggerDeviceWebhook } from "@/lib/trigger";
import { Sunrise, Moon, Layers } from "lucide-react";
import type { ReactNode } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Location = {
  id: string;
  name: string;
};

type SceneRow = {
  id: string;
  scene_name: string;
  device_id: string | null;
  desired_state: string;
};

// ─── Supabase fetchers ───────────────────────────────────────────────────────

const fetchDevices = async (): Promise<Device[]> => {
  const { data, error } = await supabase
    .from("devices")
    .select("id,name,type,state,ip_address,location_id")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Device[];
};

const fetchLocations = async (): Promise<Location[]> => {
  const { data, error } = await supabase
    .from("locations")
    .select("id,name")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Location[];
};

const fetchScenes = async (): Promise<SceneRow[]> => {
  const { data, error } = await supabase
    .from("scenes")
    .select("id,scene_name,device_id,desired_state")
    .order("scene_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SceneRow[];
};

// ─── Scene icon map ──────────────────────────────────────────────────────────

const SCENE_ICONS: Record<string, ReactNode> = {
  morning:   <Sunrise className="h-4 w-4" />,
  goodnight: <Moon className="h-4 w-4" />,
  night:     <Moon className="h-4 w-4" />,
};

// ─── Component ───────────────────────────────────────────────────────────────

const Index = () => {
  const queryClient = useQueryClient();

  const {
    data: devices,
    isLoading,
    isError,
  } = useQuery({ queryKey: ["devices"], queryFn: fetchDevices });

  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocations,
  });

  const { data: scenes } = useQuery({
    queryKey: ["scenes"],
    queryFn: fetchScenes,
  });

  // ── Realtime: invalidate device cache on any row change ─────────────────
  useEffect(() => {
    const channel = supabase
      .channel("public:devices")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        () => queryClient.invalidateQueries({ queryKey: ["devices"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // ── Toggle handler ──────────────────────────────────────────────────────
  const handleToggle = async (device: Device, nextState: string) => {
    const previous = devices ?? [];

    // Optimistic UI update
    queryClient.setQueryData<Device[]>(["devices"], (old) =>
      (old ?? []).map((d) => (d.id === device.id ? { ...d, state: nextState } : d)),
    );

    const { error } = await supabase
      .from("devices")
      .update({ state: nextState })
      .eq("id", device.id);

    if (error) {
      queryClient.setQueryData(["devices"], previous);
      toast.error(`Failed to toggle ${device.name}`);
      return;
    }

    // Call device endpoint or n8n webhook (ip_address field)
    const result = await triggerDeviceWebhook(device.ip_address, nextState, {
      id: device.id,
      name: device.name,
      type: device.type,
      location_id: device.location_id,
    });

    if (result.skipped) {
      toast.message(`${device.name} → ${nextState}`, {
        description: "No webhook configured (ip_address not set).",
      });
    } else if (result.ok) {
      toast.success(`${device.name} turned ${nextState}`);
    } else {
      toast.warning(`${device.name} → ${nextState}`, {
        description: "Webhook failed — DB state saved.",
      });
    }
  };

  // ── Scene trigger ────────────────────────────────────────────────────────
  const handleTriggerScene = async (sceneName: string, rows: SceneRow[]) => {
    const updates = rows
      .filter((r) => r.device_id)
      .map((r) =>
        supabase
          .from("devices")
          .update({ state: r.desired_state })
          .eq("id", r.device_id!),
      );

    const results = await Promise.all(updates);
    const failed  = results.filter((r) => r.error).length;

    // Refresh devices to reflect applied states
    queryClient.invalidateQueries({ queryKey: ["devices"] });

    const label = sceneName.charAt(0).toUpperCase() + sceneName.slice(1);
    if (failed > 0) {
      toast.error(`"${label}" scene failed for ${failed} device(s)`);
    } else {
      toast.success(`"${label}" scene activated`);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  // Group devices under their location label
  const locationGroups = useMemo(() => {
    if (!devices) return [];
    const locMap = new Map((locations ?? []).map((l) => [l.id, l.name]));
    const groups = new Map<string, { label: string; devices: Device[] }>();

    for (const device of devices) {
      const key   = device.location_id ?? "__none__";
      const label = device.location_id
        ? (locMap.get(device.location_id) ?? "Unknown Location")
        : "Unassigned";
      if (!groups.has(key)) groups.set(key, { label, devices: [] });
      groups.get(key)!.devices.push(device);
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.label === "Unassigned" ? 1 : a.label.localeCompare(b.label),
    );
  }, [devices, locations]);

  // Group scenes by name (e.g. "morning", "goodnight")
  const sceneGroups = useMemo(() => {
    if (!scenes || scenes.length === 0) return [];
    const map = new Map<string, SceneRow[]>();
    for (const s of scenes) {
      if (!map.has(s.scene_name)) map.set(s.scene_name, []);
      map.get(s.scene_name)!.push(s);
    }
    return Array.from(map.entries()).map(([name, rows]) => ({ name, rows }));
  }, [scenes]);

  const totalDevices  = devices?.length ?? 0;
  const activeDevices = devices?.filter(
    (d) => d.state === "on" || d.state === "open",
  ).length ?? 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <header className="bg-hero">
        <div className="container mx-auto px-6 py-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Casa Control Sync
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Real-time home automation dashboard powered by Supabase. Manage
            devices, monitor states, and react instantly.
          </p>
          {totalDevices > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {activeDevices} of {totalDevices} device
              {totalDevices !== 1 ? "s" : ""} active
            </p>
          )}
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 space-y-10">
        {/* ── Scenes panel ── */}
        {sceneGroups.length > 0 && (
          <section aria-labelledby="scenes-heading">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h2
                id="scenes-heading"
                className="text-sm font-medium text-muted-foreground uppercase tracking-wider"
              >
                Scenes
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {sceneGroups.map(({ name, rows }) => {
                const label = name.charAt(0).toUpperCase() + name.slice(1);
                const icon  = SCENE_ICONS[name.toLowerCase()];
                return (
                  <Button
                    key={name}
                    variant="outline"
                    className="gap-2"
                    onClick={() => handleTriggerScene(name, rows)}
                  >
                    {icon}
                    {label}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({rows.length})
                    </span>
                  </Button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Devices grid ── */}
        <section aria-labelledby="devices-heading">
          <h2 id="devices-heading" className="sr-only">
            Devices
          </h2>

          {/* Loading skeletons */}
          {isLoading && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="surface-card p-6 rounded-lg">
                  <Skeleton className="h-5 w-40 mb-4" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="text-destructive">
              Failed to load devices. Check your Supabase connection.
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && locationGroups.length === 0 && (
            <div className="surface-card p-8 text-center rounded-lg">
              <p className="text-muted-foreground">
                No devices found. Add devices in Supabase to get started.
              </p>
            </div>
          )}

          {/* Devices grouped by location */}
          {locationGroups.map(({ label, devices: groupDevices }) => (
            <div key={label} className="mb-8">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                {label}
              </h3>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {groupDevices.map((d) => (
                  <DeviceCard key={d.id} device={d} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
};

export default Index;
