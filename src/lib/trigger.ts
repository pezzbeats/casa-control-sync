export interface DeviceContext {
  id: string;
  name: string;
  type: string;
  location_id: string | null;
}

/**
 * POST a device state change to the configured webhook URL.
 *
 * The `url` field maps to `devices.ip_address` and can hold either:
 *   - A direct device endpoint  (e.g. http://192.168.1.42)
 *   - An n8n webhook URL        (e.g. https://your-n8n.cloud/webhook/geyser-on)
 *
 * Payload sent:
 *   { state, device_id, device_name, device_type, location_id }
 *
 * Returns:
 *   { ok: true }            — webhook responded 2xx
 *   { ok: false }           — webhook responded non-2xx or threw
 *   { ok: false, skipped }  — no valid URL configured (silent, not an error)
 */
export async function triggerDeviceWebhook(
  url: string | null | undefined,
  state: string,
  device?: DeviceContext,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        ...(device && {
          device_id: device.id,
          device_name: device.name,
          device_type: device.type,
          location_id: device.location_id,
        }),
      }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
