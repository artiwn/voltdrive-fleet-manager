# VoltDrive Fleet Manager

Static desktop prototype of the VoltDrive Fleet Management Portal.

## Stack

- HTML
- CSS
- Vanilla JavaScript ES modules
- Browser `localStorage` for prototype state
- No backend and no build step

## Run locally

Because the project uses JavaScript modules, serve the folder through a local HTTP server instead of opening the HTML files directly with `file://`.

For example, with VS Code Live Server, open `index.html` or the project root.

The entry point is:

`index.html` → `dashboard.html`

## Deploy with Vercel from GitHub

1. Create a new GitHub repository.
2. Upload the **contents of this folder to the repository root**.
3. Push/commit the files.
4. In Vercel choose **Add New → Project**.
5. Import the GitHub repository.
6. Use **Framework Preset: Other**.
7. Leave Build Command empty.
8. Leave Output Directory empty/default because this is a static root project.
9. Deploy.

No environment variables are required for the prototype.

## Main pages

- `dashboard.html` — Fleet dashboard
- `operations.html` — Live operations
- `vehicles.html` — Vehicles
- `drivers.html` — Drivers
- `schedules.html` — Departure schedules
- `depot.html` — Depot & chargers
- `sessions.html` — Charging sessions
- `reservations.html` — Reservations
- `energy.html` — Energy / power management
- `billing.html` — Billing
- `fleet-plan.html` — Fleet plan
- `home-charging.html` — Home charging reimbursements
- `reports.html` — Reports & analytics
- `alerts.html` — Alerts
- `users.html` — Users & permissions
- `fleet-settings.html` — Fleet settings

## Prototype notes

The current project is a frontend prototype. Operational data, permissions, settings, billing examples and workflow state are stored in browser `localStorage`. Real APIs, charger protocols, authentication, payments, ERP integration and server-side permission enforcement should be connected later.

The frontend permission system is for prototype behaviour only and must not be treated as a production security boundary.
