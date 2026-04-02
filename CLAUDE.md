# CLAUDE.md — casa-control-sync

## Project Overview

`casa-control-sync` is the **web dashboard UI** for a multi-location smart home automation system. It is built with Lovable.dev (React + Supabase) and serves as the user-facing control surface for IoT devices (lights, fans, ACs, geysers, motorized curtains) deployed across multiple rooms/locations.

This repo is **one component** in a larger system stack:

```
ESP32/ESP8266 devices  ──HTTP──►  n8n cloud workflows
                                        │
                              ┌─────────▼─────────┐
                              │   Supabase (PG)    │  ◄──► this repo (Lovable.dev UI)
                              └─────────┬─────────┘
                                        │
                              Telegram Bot (n8n)
```

- **n8n** handles all automation logic: motion-triggered lighting, geyser auto-off timers, sunset-based outdoor lights, scheduled morning/night scenes, and Telegram command interface.
- **Supabase** is the shared state store and real-time event bus. n8n reads/writes device states; this UI reads/writes device states. Both stay in sync via Supabase Realtime.
- **This UI** lets users view and toggle devices directly, with changes immediately propagated to Supabase (which n8n can observe) and optionally forwarded to the device via its `ip_address` endpoint.
- **ESP32/ESP8266 devices** expose simple HTTP endpoints (`/on`, `/off`) and POST to n8n webhooks on sensor events.

## Development Commands

```bash
npm run dev       # Start Vite dev server at http://localhost:8080
npm run build     # Production build (output: dist/)
npm run build:dev # Development-mode build
npm run lint      # Run ESLint
npm run preview   # Preview the production build locally
```

No test runner is configured. No CI/CD pipeline exists.

## Project Structure

```
src/
  pages/
    Index.tsx            # Main dashboard: device grid, realtime, toggle handler
    NotFound.tsx         # 404 fallback
  components/
    devices/
      DeviceCard.tsx     # Device display card with toggle switch
    ui/                  # shadcn-ui component library (48 components, do not edit)
  hooks/
    use-mobile.tsx       # Responsive breakpoint hook
    use-toast.ts         # Toast notification hook (legacy; prefer sonner)
  integrations/
    supabase/
      client.ts          # Supabase client singleton
      types.ts           # Auto-generated DB types (regenerate with Supabase CLI)
  lib/
    utils.ts             # cn() utility for Tailwind class merging
    trigger.ts           # triggerDeviceWebhook() — POSTs state to device IP
  App.tsx                # Root: QueryClient, BrowserRouter, providers
  main.tsx               # React DOM entry point
  index.css              # Tailwind directives + design system CSS variables

supabase/
  config.toml            # Supabase project ID
  migrations/            # SQL migrations (5 files); run via Supabase CLI
```

## Database Schema

All tables are in the `public` schema with RLS enabled.

### `devices`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto-generated |
| name | text | e.g. "Living Room Light" |
| type | text | `light`, `fan`, `AC`, `curtain`, `geyser`, etc. |
| state | text | `on` / `off` (or custom values); default `off` |
| ip_address | text nullable | Device HTTP endpoint base URL (e.g. `http://192.168.1.x`) |
| location_id | uuid FK → locations | Groups devices by room/site |
| created_at / updated_at | timestamptz | Auto-managed |

### `locations`
| Column | Type |
|---|---|
| id | uuid PK |
| name | text |

### `sensor_events`
Logs PIR/sensor triggers from devices.
| Column | Type |
|---|---|
| id | uuid PK |
| device_id | uuid FK → devices |
| event_type | text | e.g. `motion` |
| value | text nullable | |
| timestamp | timestamptz | |

### `scenes`
Configurable device states for named scenes (morning, night, etc.).
| Column | Type |
|---|---|
| id | uuid PK |
| scene_name | text | e.g. `morning`, `goodnight` |
| device_id | uuid FK → devices | |
| desired_state | text | e.g. `on`, `off`, `open` |

**RLS policies:** All tables allow public `SELECT`. `devices` additionally allows public `UPDATE` (for state toggling). Migrations are in `supabase/migrations/`.

**DB triggers:** All tables auto-update `updated_at` on every row change.

## Key Conventions

### React patterns
- Functional components only — no class components.
- Server state via **TanStack React Query** (`useQuery`, `useQueryClient`). Query keys are simple string arrays like `["devices"]`.
- **Optimistic updates**: set query data immediately, then revert on error (`queryClient.setQueryData` → supabase call → rollback if error).
- Supabase Realtime subscriptions (`postgres_changes`) in `useEffect` to invalidate queries on external changes. Always clean up channels in the effect return.
- Toast notifications via **Sonner** (`import { toast } from "sonner"`). Use `toast.success`, `toast.error`, `toast.message` for user feedback.

### Styling
- **Tailwind CSS** utility-first throughout. Use the `cn()` helper from `@/lib/utils` for conditional/merged class names.
- Design system tokens are CSS custom properties defined in `src/index.css` (colors, shadows, gradients). Use semantic tokens (`bg-primary`, `text-muted-foreground`, etc.) — do not hardcode hex values.
- Key custom classes: `.bg-hero` (hero section gradient), `.surface-card` (glassmorphism card), `.shadow-elegant`, `.transition-smooth`.
- Dark mode uses the `class` strategy (Tailwind). Token values flip in `@media (prefers-color-scheme: dark)` / `.dark` selector.

### Components
- UI primitives live in `src/components/ui/` — these are shadcn-ui components. **Do not modify them directly.** Add new variants via the `variants` pattern in each file, or wrap them.
- Feature components go in domain subdirectories: `src/components/devices/`, etc.
- The `Device` type is exported from `DeviceCard.tsx` and re-used in `Index.tsx`.

### Imports
- Use the `@/` path alias for all `src/` imports (e.g. `@/lib/utils`, `@/components/ui/card`).
- The alias is configured in `tsconfig.json` and `vite.config.ts`.

### TypeScript
- `noImplicitAny: false` and `strictNullChecks: false` — the project uses relaxed TS settings. Type annotations are preferred but not strictly enforced by the compiler.
- Database types are auto-generated in `src/integrations/supabase/types.ts`. Use the `Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>` generics. Regenerate with `npx supabase gen types typescript`.

## Supabase Integration

**Client** (`src/integrations/supabase/client.ts`): Single `createClient` call with the project URL and anon key. Credentials are hardcoded — no `.env` file. Configured with `localStorage` session persistence and auto token refresh.

**Direct DB calls**: Use `supabase.from("table").select(...)`, `.update(...)`, etc. directly in components/pages. No ORM or query builder abstraction layer.

**Realtime**: Subscribe to `postgres_changes` on the `devices` table in `Index.tsx`. On any change, invalidate the `["devices"]` query to trigger a refetch. This keeps the UI in sync when n8n workflows update device states.

## n8n Webhook / Device Control Integration

When a user toggles a device in the UI:
1. Optimistic UI update (immediate).
2. Supabase `UPDATE devices SET state = '...'` — this is the source of truth and triggers Realtime to other clients (including n8n if configured to poll/subscribe).
3. If `device.ip_address` is a valid `http(s)://...` URL, `triggerDeviceWebhook()` (`src/lib/trigger.ts`) POSTs `{ state: "on"|"off" }` directly to the device endpoint.

The `ip_address` field can hold either:
- A **direct device URL** (e.g. `http://192.168.1.42`) — UI POSTs directly to the ESP32.
- An **n8n webhook URL** — UI triggers an n8n workflow which then controls the device.

If `ip_address` is null or not a valid URL, the webhook step is silently skipped and the Supabase state update alone is used (n8n can then observe the state change and act on it).

## n8n Workflow Context

The following n8n workflows interact with the Supabase `devices` table managed by this UI. AI assistants modifying the schema should be aware of these consumers:

| Workflow | Trigger | Reads | Writes |
|---|---|---|---|
| Motion-Activated Lighting | PIR HTTP webhook | `devices` (by `location_id`, `type=light`) | `devices.state` |
| Geyser Auto-Off Timer | Geyser-on webhook | — | `devices.state` |
| Sunset Outdoor Lighting | Daily cron + API | `devices` (outdoor lights) | `devices.state` |
| Telegram Bot Commands | Telegram message | `devices` (by name) | `devices.state` |
| Morning / Goodnight Scenes | Cron (07:00 / 23:00) | `scenes` table | `devices.state` |

## Known Gaps

- **No tests** — no test framework (Vitest/Jest) configured. No test files exist.
- **No CI/CD** — no GitHub Actions or other pipeline.
- **Hardcoded Supabase credentials** — project URL and anon key are in `src/integrations/supabase/client.ts`. Moving to `.env` would require adding `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars and updating the client import.
- **No authentication** — the dashboard is publicly accessible; Supabase RLS allows public reads and device state updates.
- **Webhook partially implemented** — `src/lib/trigger.ts` exists but `Index.tsx` currently calls `fetch(device.ip_address)` inline rather than using `triggerDeviceWebhook()`. These should be unified.

## Branch Strategy

- `main` — production branch, reflects what is deployed on Lovable.dev.
- `claude/<description>` — AI-created feature branches. Merge via PR.
- Commit messages are brief and imperative. Supabase migration commits are auto-generated by the Lovable platform.
