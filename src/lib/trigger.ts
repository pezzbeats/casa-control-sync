export async function triggerDeviceWebhook(url: string | null | undefined, state: 'on' | 'off') {
  if (!url || !/^https?:\/\//i.test(url)) {
    // No valid URL configured yet; act as placeholder
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });
    return { ok: res.ok, skipped: false };
  } catch (e) {
    return { ok: false, skipped: false };
  }
}
