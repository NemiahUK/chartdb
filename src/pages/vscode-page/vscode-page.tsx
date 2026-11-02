import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Check, Code2, Copy, Download } from 'lucide-react';
import { Button } from '@/components/button/button';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { name, version, engines } from '../../../vscode/package.json';

const filename = `${name}-${version}.vsix`;
const exampleConfig = JSON.stringify(
    {
        version: 1,
        name: 'cosmOS',
        schema: 'prisma/dbml/schema.dbml',
        layout: 'prisma/chartdb/layout.json',
        databaseType: 'generic',
    },
    null,
    2
);

const VSCodePageContent: React.FC = () => {
    const [copyStatus, setCopyStatus] = useState('');
    const copyConfig = async () => {
        try {
            await navigator.clipboard.writeText(exampleConfig);
            setCopyStatus('Copied');
        } catch {
            setCopyStatus('Select the example below to copy it manually.');
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>ChartDB for VS Code — Download and setup</title>
            </Helmet>
            <header className="border-b">
                <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Back to ChartDB
                    </Link>
                    <span className="text-sm font-medium">
                        VS Code extension
                    </span>
                </nav>
            </header>
            <main className="mx-auto max-w-3xl space-y-10 px-5 py-10 sm:py-14">
                <section aria-labelledby="page-title" className="space-y-5">
                    <Code2 className="size-9 text-primary" aria-hidden="true" />
                    <h1
                        id="page-title"
                        className="text-3xl font-semibold tracking-tight sm:text-4xl"
                    >
                        Your diagrams, in your repository
                    </h1>
                    <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                        Open generated DBML in ChartDB inside VS Code. Save
                        table positions, colours, groups and diagram notes
                        directly to your layout file, ready to commit with your
                        code.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-5">
                        <Button asChild>
                            <a
                                href={`/downloads/${filename}`}
                                download={filename}
                            >
                                <Download
                                    className="mr-2 size-4"
                                    aria-hidden="true"
                                />
                                Download extension
                            </a>
                        </Button>
                        <div className="text-sm">
                            <p className="font-medium">Version {version}</p>
                            <p className="text-muted-foreground">
                                VS Code {engines.vscode.replace('^', '')} or
                                later
                                {' · '}Windows, macOS and Linux
                            </p>
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Schema changes stay in your source files. The extension
                        watches the DBML for updates and keeps diagram editing
                        limited to layout and presentation.
                    </p>
                </section>

                <section aria-labelledby="install-title" className="space-y-4">
                    <h2 id="install-title" className="text-xl font-semibold">
                        1. Install in VS Code
                    </h2>
                    <ol className="list-decimal space-y-3 pl-5 leading-relaxed">
                        <li>Download the extension using the button above.</li>
                        <li>
                            In VS Code, open the Command Palette with{' '}
                            <strong>Ctrl+Shift+P</strong> (Mac:{' '}
                            <strong>Cmd+Shift+P</strong>).
                        </li>
                        <li>
                            Run <strong>Extensions: Install from VSIX…</strong>{' '}
                            and select the downloaded <code>.vsix</code> file.
                            Reload the window if prompted.
                        </li>
                    </ol>
                    <aside className="rounded-lg border p-4 text-sm leading-relaxed">
                        <h3 className="mb-1 font-semibold">
                            Using WSL, SSH or a Dev Container?
                        </h3>
                        Open your repository in its remote VS Code window first.
                        Install the extension there and check that it appears
                        under that remote environment in Extensions. If VS Code
                        offers an{' '}
                        <strong>Install in WSL / SSH / Dev Container</strong>{' '}
                        button, use it. The extension needs to run where your
                        repository files live.
                    </aside>
                </section>

                <section
                    aria-labelledby="configure-title"
                    className="space-y-4"
                >
                    <h2 id="configure-title" className="text-xl font-semibold">
                        2. Configure your repository
                    </h2>
                    <p className="leading-relaxed">
                        If your repository already has{' '}
                        <code>.chartdb.json</code>, keep it and move to the next
                        step. Otherwise, create it at the workspace folder root.
                        This example uses the Cosmos paths; adjust them for your
                        repository.
                    </p>
                    <div className="overflow-hidden rounded-lg border">
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2">
                            <span className="text-sm font-medium">
                                .chartdb.json
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={copyConfig}
                            >
                                {copyStatus === 'Copied' ? (
                                    <Check
                                        className="mr-2 size-4"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Copy
                                        className="mr-2 size-4"
                                        aria-hidden="true"
                                    />
                                )}
                                {copyStatus === 'Copied'
                                    ? 'Copied'
                                    : 'Copy config'}
                            </Button>
                        </div>
                        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
                            <code>{exampleConfig}</code>
                        </pre>
                    </div>
                    <p role="status" className="text-sm text-muted-foreground">
                        {copyStatus}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Paths are relative to the workspace folder. The DBML
                        must already exist; the extension creates a missing
                        layout file. One diagram per workspace folder is
                        supported. For an existing ChartDB JSON export, add the
                        optional <code>importLayoutFrom</code> path before the
                        first open to seed a new layout without changing the
                        export.
                    </p>
                </section>

                <section aria-labelledby="open-title" className="space-y-4">
                    <h2 id="open-title" className="text-xl font-semibold">
                        3. Open your diagram
                    </h2>
                    <p className="leading-relaxed">
                        Open the configured layout JSON or DBML file and click
                        the preview icon in the editor toolbar. You can also run{' '}
                        <strong>ChartDB: Open Repository Diagram</strong> from
                        the Command Palette. VS Code must trust the workspace to
                        let the extension save layout changes.
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        To show <strong>Open in ChartDB</strong> above line 1,
                        enable <strong>Editor: Code Lens</strong> in Settings (
                        <code>editor.codeLens</code>). If the toolbar icon is
                        hidden, check its <strong>…</strong> or right-click
                        menu. Layout edits save automatically; commits and
                        pushes stay part of your normal Git workflow.
                    </p>
                </section>

                <section
                    aria-labelledby="updates-title"
                    className="space-y-3 border-t pt-6"
                >
                    <h2 id="updates-title" className="text-xl font-semibold">
                        Updating the extension
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Return to this page, download the newer version and
                        repeat
                        <strong> Extensions: Install from VSIX…</strong>.
                        Updates from this site are installed manually. Your
                        repository configuration and saved layouts stay in
                        place.
                    </p>
                </section>
                <footer className="text-sm text-muted-foreground">
                    Based on ChartDB by the ChartDB contributors. Distributed
                    under AGPL-3.0; the extension includes the licence.
                </footer>
            </main>
        </div>
    );
};

export const VSCodePage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <VSCodePageContent />
        </ThemeProvider>
    </LocalConfigProvider>
);
