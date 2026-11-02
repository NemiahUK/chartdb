# ChartDB Repository Diagrams

Open a generated DBML schema in VS Code and save table colours, positions, sizes, groups and diagram notes directly to your repository. The extension bundles this fork's ChartDB editor and works without the deployed website. The standalone web app remains available.

## Install

Build from the ChartDB repository root:

```sh
npm ci
npm run vscode:package
```

In VS Code, run **Extensions: Install from VSIX…** and select `vscode/chartdb-repository-0.1.0.vsix`. Reload VS Code if requested. The extension runs in the workspace, including with Remote SSH and Dev Containers. It requires a trusted workspace.

## Configure a repository

Add `.chartdb.json` at the workspace folder root. For Cosmos:

```json
{
  "version": 1,
  "name": "cosmOS",
  "schema": "prisma/dbml/schema.dbml",
  "layout": "prisma/chartdb/layout.json",
  "importLayoutFrom": "prisma/chartdb/schema.json",
  "databaseType": "generic"
}
```

Run **ChartDB: Open Repository Diagram** from the command palette. With multiple workspace folders, select the repository to open. Paths are relative to that folder. One configured diagram per workspace folder is supported in this version.

If `layout.json` is missing, the extension reads colours, positions, groups and notes from `importLayoutFrom` and creates the layout file. It does not modify the original export. `importLayoutFrom` is optional for new diagrams and can be removed after migration. `generic` matches Cosmos's current ChartDB export; other supported database types are listed in the configuration schema.

Commit `.chartdb.json` and the new layout file. This extension saves files locally; Git commits and pushes remain your normal workflow.

## Editing and refresh

- The DBML file controls tables, fields, indexes, constraints and relationships. These cannot be edited in the repository diagram.
- Positions, colours, widths, order, expanded state, group membership, groups and diagram notes are saved to layout JSON. Table/database comments belong to the schema and remain read-only.
- Saving happens shortly after an edit, with status shown in the toolbar. **Save layout** or Ctrl/Cmd+S requests an immediate save. Undo and redo operate on layout edits.
- The extension watches the configured files. Saved DBML changes refresh the diagram while preserving presentation. Keep using your existing generator to update DBML after source schema edits; the extension does not run generators or migrations.
- Multiline table notes emitted in ordinary single quotes by Prisma DBML generators are normalized in memory for the current parser. The source file is not rewritten.
- Concurrent edits, dirty JSON text buffers, invalid DBML and failed writes stop automatic saving and show an error. Resolve the file issue, then use **Reload**. Discarding unsaved diagram changes requires confirmation.
- Closing a tab flushes its latest draft. If a conflicting change prevents saving, the draft is retained in VS Code workspace storage and offered for recovery on reopening. Abrupt process termination is not a substitute for checking the saved status.
- Layout keys encode `[schema, tableName]`, independent of ChartDB's generated IDs. Removed tables' layout entries are retained so switching branches does not erase them. Renames are treated as new tables; transfer a layout entry explicitly if needed.
- Pan, zoom, filters and selection are session state, not shared diagram data. Refreshing the schema resets layout undo history.

## Development and verification

```sh
npm run vscode:build
npx vitest run src/repository/__tests__ vscode/test/extension.test.ts
npm run lint
npm run build
```

To debug, launch VS Code with `--extensionDevelopmentPath=/absolute/path/to/chartdb/vscode` and open a configured fixture repository. Rebuild after changing either the host or UI. The bridge tests exercise the host with a VS Code API double; also check the packaged extension in a real VS Code window before publishing.

The web app uses `npm run dev` and `npm run build` as before. Both entry points share the renderer. Repository mode uses filesystem messages instead of the browser diagram database, and enforces schema restrictions at both the UI and mutation boundary. The host validates the presentation-only format again before writing.

## Credits and licence

Based on [ChartDB](https://github.com/chartdb/chartdb), an open-source database diagram editor by the ChartDB contributors. This fork and extension retain the GNU Affero General Public License v3.0; see the bundled LICENSE. Promotional popups and community navigation have been removed from the editor.
