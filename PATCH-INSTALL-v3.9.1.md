# Install — v3.9.1 GitHub Pages Loader Hotfix

1. Back up your current repository and especially the `data/` folder.
2. Extract the safe patch at the repository root, keeping its folder structure. The ZIP intentionally excludes `data/`.
3. Run from the `worker/` folder:

```powershell
npm install
npm test
npm run check
```

4. From the repository root, inspect the changed files and deploy the static site update:

```powershell
git status
git add index.html assets/css/style.css assets/js/app.js worker/package.json worker/tests/dashboard-loader.test.mjs README.md CHANGELOG-v3.9.1.md FIXES-v3.9.1.md PATCH-INSTALL-v3.9.1.md
git commit -m "Fix GitHub Pages loading screen timeout"
git push origin main
```

5. Wait for the GitHub Pages deployment to finish, then open the dashboard in a private/incognito window or perform a hard refresh (`Ctrl+F5`). The CSS and JS query versions are changed to avoid stale cached bundles.

No Cloudflare Worker redeploy or new secret is required for this frontend-only hotfix.

If the failsafe warning appears, the overlay will no longer block the page. The message shows a recoverable failure; still check that `data/index.json`, `data/config.json`, and each month listed in `data/index.json` are present in the `main` branch and accessible from GitHub Pages.
