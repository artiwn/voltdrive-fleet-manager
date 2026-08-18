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

## Canonical fleet structure

The prototype keeps separate master records for:

- Depots (`depotId`)
- Departments (`departmentId`)
- Routes (`routeId`)
- Parking bays (`parkingBayId`)

Vehicles, drivers, schedules, chargers, reservations and scoped users reference these master IDs. Parking bays are independent resources and do not have to map one-to-one to chargers. Fleet administrators can add master records from **Fleet Settings → Structure**.

Saved data from the earlier free-text prototype is migrated in the browser when loaded. Custom legacy route, department and bay names are preserved as canonical master records instead of being discarded.

A lightweight state/integrity check is included:

```bash
node scripts/data-model-smoke.mjs
```

## Access & depot scope

Fleet access is now based on canonical `scopeDepotIds`, not route names, charger IDs or other display text. Legacy text scopes are migrated once; after migration the ID scope is authoritative and invalid depot IDs fail closed.

The administration permissions are separated into:

- `users.view` / `users.manage`
- `roles.view` / `roles.manage`
- `audit.view` / `audit.export`

A scoped user administrator can only manage users whose depot scope is contained inside the administrator's own scope. Role assignment is validated again during state persistence, so changing a hidden `<select>` option or injecting an `All depots` user does not widen authority in the prototype state layer.

All page controllers stop their module-specific logic when the shared access guard returns `denied`. Company-wide Billing, Fleet Plan and Fleet Settings require `All depots` scope. Depot managers continue to manage operational Energy controls through depot-specific policy records, so a Central Depot strategy change does not modify West Hub or Airport Hub policy.

Because this build is a visual prototype, the **Prototype access** identity switcher intentionally remains visible for every active preview user. It reads from a separate full prototype identity directory, so after switching to a scoped Fleet Manager, Dispatcher, Finance or read-only account you can immediately switch again to any other active prototype user. This preview-only switcher does not change the permissions, depot scope or fail-closed rules applied to the selected identity.

Additional checks:

```bash
npm run smoke:access
npm run smoke:guards
npm run verify
```

## Scheduling & reservations

Departure schedules use an explicit `serviceDate` plus recurrence (`once`, `weekdays`, `daily`). Vehicle/driver overlap is validated before Save and Confirm, and CSV imports skip conflicting rows instead of inserting them into the plan. Optional CSV columns after target SOC are `serviceDate` and `recurrence`.

Reservations use interval-based capacity checks (`arrivalDate` + `arrival` + `duration`) instead of treating the current Charger status as a future calendar. The reservation engine blocks overlapping Vehicle, Charger and Parking Bay use and also checks total future charging slots for auto-assignment/bay workflows. Draft reservations do not consume capacity.

Supported reservation lifecycle states are:

- Draft
- Confirmed
- Active
- Completed
- Cancelled
- Expired
- No-show
- Waiting list

The prototype uses `settings.operationDate` / `settings.operationTime` as its deterministic demo clock so lifecycle examples remain reproducible. A future reservation only changes live Charger/Bay state when it enters the near-arrival protection window; calendar booking and current equipment state remain separate concepts.

Planning regression checks:

```bash
npm run smoke:planning
```
## Charger compatibility & assignment

Vehicle charging capability is now part of the canonical fleet state instead of being initialized only by the Vehicles page. Each vehicle keeps compatible connector types plus prototype AC/DC acceptance limits, while chargers keep concrete connector records.

The shared `js/core/charging-compatibility.js` engine is used by Live Operations, Depot assignment and Reservations. It:

- matches Vehicle connector types to Charger connectors;
- keeps Depot scope in the live-assignment check;
- selects a concrete `connectorId`;
- caps allocated power at the lower of Charger output and the vehicle prototype charging acceptance;
- excludes incompatible Chargers from manual assignment and reservation choices;
- calculates auto-assignment reservation capacity from compatible Chargers instead of every Charger at the Depot;
- rejects a tampered incompatible Charger/Bay again when a reservation is saved;
- keeps historical session compatibility separate from whether a Charger is available or healthy now.

Vehicle profiles expose the prototype AC/DC acceptance fields so these limits can be edited without changing code. Legacy/custom vehicles are migrated to canonical connector arrays and default prototype limits.

Compatibility regression check:

```bash
npm run smoke:compatibility
```



## Contextual navigation (v19)
Fleet entities now deep-link through a shared context resolver instead of losing the selected record between pages. Vehicle, Driver, Schedule, Reservation, Charging Session and Charger drawers expose related records, and the destination pages consume exact query parameters such as `?vehicle=`, `?driver=`, `?schedule=`, `?reservation=`, `?session=` and `?charger=`. Home Charging also accepts `?driver=` / `?claim=` context. Run `npm run smoke:context` to verify the canonical relationship chain.


## Reports & Analytics — v20

The Reports workspace now uses dated prototype records rather than multiplying the current snapshot by period factors. The reporting anchor is `settings.operationDate`, so demo results are reproducible.

Historical prototype state includes:

- dated charging sessions and home-charging claims;
- reservation outcomes including completed, cancelled and no-show;
- departure readiness outcomes;
- per-charger utilization history;
- independent parking-bay utilization history;
- maintenance-ticket history and repair duration;
- depot energy history with grid, solar/battery renewable energy and stored prototype carbon-avoidance telemetry.

Reports now cover parking-bay utilization, reservation/no-show KPIs, maintenance performance, busy/inactive charging windows, renewable energy and carbon information. `Today`, `7 days`, `30 days` and `90 days` filter actual dated records in state.

Run the analytics regression check with:

```bash
npm run smoke:reports
```

`npm run verify` includes this test together with the previous data-model, access/scope, scheduling, compatibility and contextual-navigation suites.
