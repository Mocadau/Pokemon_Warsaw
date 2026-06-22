# Pokemon Citydex Warsaw

Static Vite app prepared to run at `/pokemon/`, so it can live under `mocadau.com/pokemon` next to a future portfolio homepage.

## Local commands

```bash
npm install
npm run build
```

The build writes deployable files to `dist/`:

- `dist/pokemon/` contains the app and assets.
- `dist/_redirects` redirects `/pokemon` to `/pokemon/` and serves the app for `/pokemon/*`.

## Cloudflare Pages

Use Git integration with these settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `22.12.0` or newer

After the first deployment, add `mocadau.com` as the custom domain for the Pages project. The app will be available at `https://mocadau.com/pokemon/`.
