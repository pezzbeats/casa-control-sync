import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Device = {
  id: string;
  name: string;
  type: string;
  state: string;
  ip_address: string | null;
  location_id: string | null;
};

interface DeviceCardProps {
  device: Device;
  onToggle: (device: Device, nextState: 'on' | 'off') => void;
}

export function DeviceCard({ device, onToggle }: DeviceCardProps) {
  const checked = device.state === 'on';

  return (
    <Card
      className={cn(
        "surface-card shadow-elegant transition-smooth group hover:-translate-y-0.5 hover:shadow-lg"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">{device.name}</CardTitle>
        <Badge variant="secondary" className="uppercase tracking-wide">
          {device.type}
        </Badge>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          State: <span className="font-medium text-foreground">{device.state}</span>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={(val) => onToggle(device, val ? 'on' : 'off')}
          aria-label={`Toggle ${device.name}`}
        />
      </CardContent>
    </Card>
  );
}
