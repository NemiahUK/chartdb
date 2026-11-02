import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

await build({
    entryPoints: ['vscode/src/extension.ts'],
    outfile: 'vscode/dist/extension.cjs',
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
    tsconfig: 'tsconfig.app.json',
});
await copyFile('LICENSE', 'vscode/LICENSE');
