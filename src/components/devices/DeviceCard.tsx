import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Lightbulb,
  Wind,
  Thermometer,
  Flame,
  Plug,
  Power,
  Cpu,
  AlignJustify,
} from "lucide-react";

export type Device = {
  id: string;
  name: string;
  type: string;
  state: string;
  ip_address: string | null;
  location_id: string | null;
};

// Map device type → icon component
const DEVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  light:      Lightbulb,
  fan:        Wind,
  ac:         Thermometer,
  curtain:    AlignJustify,
  geyser:     Flame,
  thermostat: Thermometer,
  plug:       Plug,
  switch:     Power,
  sensor:     Cpu,
};

// States that mean a device is "active" (on / open)
const ACTIVE_STATES = new Set(["on", "open"]);

// For curtain-type devices the toggle moves between open/closed; all others use on/off
function getNextState(type: string, activate: boolean): string {
  if (type.toLowerCase() === "curtain") return activate ? "open" : "closed";
  return activate ? "on" : "off";
}

interface DeviceCardProps {
  device: Device;
  onToggle: (device: Device, nextState: string) => void;
}

export function DeviceCard({ device, onToggle }: DeviceCardProps) {
  const typeLower = device.type.toLowerCase();
  const isActive  = ACTIVE_STATES.has(device.state.toLowerCase());
  const Icon      = DEVICE_ICONS[typeLower] ?? Power;

  return (
    <Card
      className={cn(
        "surface-card shadow-elegant transition-smooth group hover:-translate-y-0.5 hover:shadow-lg",
        isActive && "border-primary/40",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          />
          <CardTitle className="text-base font-semibold truncate">
            {device.name}
          </CardTitle>
        </div>
        <Badge variant="secondary" className="uppercase tracking-wide text-xs shrink-0 ml-2">
          {device.type}
        </Badge>
      </CardHeader>

      <CardContent className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          State:{" "}
          <span
            className={cn(
              "font-medium",
              isActive ? "text-primary" : "text-foreground",
            )}
          >
            {device.state}
          </span>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={(val) => onToggle(device, getNextState(device.type, val))}
          aria-label={`Toggle ${device.name}`}
        />
      </CardContent>
    </Card>
  );
}
