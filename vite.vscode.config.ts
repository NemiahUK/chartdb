import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    base: './',
    publicDir: false,
    plugins: [
        react(),
        {
            name: 'webview-workers',
            enforce: 'pre',
            transform(code, id) {
                if (id.endsWith('/components/code-snippet/config.ts')) {
                    return code.replace(/\?worker/g, '?worker&inline');
                }
            },
        },
    ],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    build: {
        outDir: 'vscode/dist/webview',
        emptyOutDir: true,
        rollupOptions: { input: path.resolve(__dirname, 'vscode.html') },
    },
});
