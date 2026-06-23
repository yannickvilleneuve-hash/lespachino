# Tailscale Serve Setup — pacman (tailnet-only access)

This runbook migrates the app from public Funnel exposure to tailnet-only
access via `tailscale serve`. The app binds to `127.0.0.1:3005`; Tailscale
provides TLS and proxies requests from tailnet devices only.

---

## Prerequisites

- Tailscale is installed and authenticated on `hino1-thinkcentre-m93p`.
- The app is already built and running under PM2 (`pm2 list`).
- You have shell access to the machine.

---

## Step 1 — Turn Funnel OFF first

> **WARNING:** The app currently has NO login page (login was on a route that
> has been removed). While Funnel is ON the app is publicly reachable with no
> authentication. Disable Funnel BEFORE making any other changes.

Check which ports are currently served/funneled:

```bash
tailscale serve status
```

Disable Funnel on every port that shows `Funnel on`. Typically:

```bash
tailscale funnel --https=443 off
tailscale funnel --https=8443 off   # only if listed by serve status
tailscale funnel --https=10000 off  # only if listed by serve status
```

Verify Funnel is gone:

```bash
tailscale serve status
# Should show no "Funnel" entries
```

---

## Step 2 — Turn Tailscale Serve ON (tailnet-only)

This makes the app reachable only from devices on your tailnet at the
MagicDNS hostname `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net`.
Tailscale handles TLS automatically.

```bash
tailscale serve --bg --https=443 127.0.0.1:3005
```

Confirm the mapping is active:

```bash
tailscale serve status
# Expected output includes:
#   https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net
#     / -> http://127.0.0.1:3005
# and NO "Funnel" line
```

---

## Step 3 — Rebuild and restart the app

The `start` script now binds to `127.0.0.1` (not `0.0.0.0`), so a fresh
build and restart is required:

```bash
cd /home/hino1/pacman
pnpm build && pm2 restart pacman
```

---

## Step 4 — Verify

Run these checks:

1. **From a second tailnet device** — open
   `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net` in a browser. The
   pacman dashboard should load.

2. **From a non-tailnet network** (phone on LTE, VPN off) — the same URL
   should be unreachable (connection refused or DNS failure).

3. **Direct tailnet-IP connection refused** — from any tailnet device:
   ```bash
   curl http://100.107.207.88:3005
   # Should return: curl: (7) Failed to connect ... Connection refused
   ```
   This confirms the app is bound to `127.0.0.1` only and cannot be reached
   even from other tailnet devices hitting the raw IP.

4. **Serve status clean** — no Funnel, correct proxy target:
   ```bash
   tailscale serve status
   ```

---

## IMPORTANT — Do NOT re-expose the app

> **The app has no authentication layer.** Re-enabling Funnel (`tailscale
> funnel --https=443 on`) or reverting the `start` host back to `0.0.0.0` in
> `package.json` will make the app publicly accessible with no login. Do not
> do either of these things.

---

## Rollback

To stop serving entirely (e.g., for maintenance):

```bash
tailscale serve --https=443 off
```

To bring it back (tailnet-only, no Funnel):

```bash
tailscale serve --bg --https=443 127.0.0.1:3005
```
