# Frontend bundle measurements

Run from the repository root:

```sh
npm run build:report --workspace @church/web
```

The command type-checks the frontend, builds it for production and reports raw
and gzip sizes. Initial JavaScript includes the entry and its transitive static
imports from Vite's manifest; dynamic imports are counted only in the total.
Each file is compressed separately. CSS, the PDF worker and service-worker files
are excluded from both measurements.

## 2026-10-16 comparison

| Measurement                 |      Before |       After |
| --------------------------- | ----------: | ----------: |
| Initial JavaScript          | 1,365.38 kB |   966.36 kB |
| Initial JavaScript, gzip    |   390.77 kB |   292.15 kB |
| All JavaScript chunks       | 2,118.85 kB | 2,138.64 kB |
| All JavaScript chunks, gzip |   584.72 kB |   613.77 kB |
| Modules transformed         |      12,008 |       1,262 |

These measurements compare builds of the same working tree before and after
this optimization, using decimal kB. Initial gzip JavaScript decreased by 25.2%.
Total JavaScript grew slightly due to chunk boundaries, import references and
reduced compression across separately compressed files.

MUI icon imports use individual entry points instead of the package barrel.
Dashboard, member screens, event screens, secondary authentication screens and
the authenticated application shell load through React.lazy. Existing route
guards and Suspense loading indicators are retained. Rollup places shared UI
modules according to usage instead of forcing every MUI component into one
eagerly loaded vendor chunk.

This is primarily an initial-load and module-processing improvement; it does
not remove application features. The PWA still precaches lazy JavaScript in the
background, so these figures do not represent total first-visit network traffic.
The main entry still exceeds Vite's default 500 kB chunk warning threshold.
