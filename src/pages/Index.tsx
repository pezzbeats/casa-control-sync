import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DeviceCard, type Device } from "@/components/devices/DeviceCard";
import { Skeleton } from "@/components/ui/skeleton";

const fetchDevices = async (): Promise<Device[]> => {
  const { data, error } = await supabase
    .from("devices")
    .select("id,name,type,state,ip_address,location_id")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as unknown as Device[];
};

const Index = () => {
  const queryClient = useQueryClient();
  const { data: devices, isLoading, isError } = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
  });

  useEffect(() => {
    const channel = supabase
      .channel("public:devices")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["devices"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleToggle = async (device: Device, nextState: "on" | "off") => {
    const previous = devices ?? [];
    // Optimistic update
    queryClient.setQueryData<Device[] | undefined>(["devices"], (old) =>
      (old ?? []).map((d) => (d.id === device.id ? { ...d, state: nextState } : d))
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

    // Placeholder webhook call – configure device.ip_address later
    try {
      const res = await fetch(device.ip_address ?? "", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState, device: device.name }),
      });
      if (!res.ok) throw new Error("Webhook failed");
      toast.success(`${device.name} turned ${nextState}`);
    } catch {
      // Webhook optional at this stage
      toast.message(`${device.name} set to ${nextState}`, {
        description: "Webhook not configured or failed (placeholder).",
      });
    }
  };

  return (
    <div className="min-h-screen">
      <header className="bg-hero">
        <div className="container mx-auto px-6 py-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Casa Control Sync
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Real-time home automation dashboard powered by Supabase. Manage devices, monitor states, and react instantly.
          </p>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        <section aria-labelledby="devices-heading">
          <h2 id="devices-heading" className="sr-only">
            Devices
          </h2>

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

          {isError && (
            <div className="text-destructive">Failed to load devices.</div>
          )}

          {devices && devices.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {devices.map((d) => (
                <DeviceCard key={d.id} device={d} onToggle={handleToggle} />
              ))}
            </div>
          )}

          {devices && devices.length === 0 && (
            <div className="surface-card p-8 text-center rounded-lg">
              <p className="text-muted-foreground">No devices found. Add devices in Supabase to get started.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Index;
