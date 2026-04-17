# Test Recommendation Script

Run from the repo root:

```powershell
npm run test:recommend -- src/app/tasktimer/tasktimerClient.ts src/app/globals.css
```

Or, if Git is available in your shell, run:

```powershell
npm run test:recommend
```

The script prints recommended commands based on changed paths, including:

- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:e2e:auth`
- `npm run test:e2e:mobile`

Use it as a routing helper, not an absolute rule. If a change is unusually risky or cross-cutting, run the broader set.
