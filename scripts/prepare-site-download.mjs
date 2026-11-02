import { copyFile, mkdir, readFile } from 'node:fs/promises';

// Run after both builds: Vite clears dist, and the VSIX must come from
// this release's manifest rather than whichever old package is on disk.
const root = new URL('../', import.meta.url);
const { name, version } = JSON.parse(
    await readFile(new URL('vscode/package.json', root), 'utf8')
);
const filename = `${name}-${version}.vsix`;
await mkdir(new URL('dist/downloads/', root), { recursive: true });
await copyFile(
    new URL(`vscode/${filename}`, root),
    new URL(`dist/downloads/${filename}`, root)
);
// Give the shareable setup URL a real static entry, including /vscode/.
// The site's existing error-page fallback otherwise returns HTTP 404 for
// client-side routes even though React can render them.
await mkdir(new URL('dist/vscode/', root), { recursive: true });
await copyFile(
    new URL('dist/index.html', root),
    new URL('dist/vscode/index.html', root)
);
console.log(`Site download ready: /downloads/${filename}`);
