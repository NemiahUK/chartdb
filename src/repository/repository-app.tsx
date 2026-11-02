import { normalizeGeneratedNotes, describeDBMLError } from './dbml';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { TooltipProvider } from '@/components/tooltip/tooltip';
import { EditorPage } from '@/pages/editor-page/editor-page';
import { importDBMLToDiagram } from '@/lib/dbml/dbml-import/dbml-import';
import type { Diagram } from '@/lib/domain/diagram';
import { applyLayout, extractLayout, serializeLayout } from './layout';
import type { RepositoryLayout } from './layout';
import type {
    EditorMessage,
    HostMessage,
    RepositorySnapshot,
} from './protocol';
import { RepositoryContext } from './repository-context';

declare const acquireVsCodeApi: () => {
    postMessage: (message: EditorMessage) => void;
};
const vscode = acquireVsCodeApi();

export function RepositoryApp() {
    const [diagram, setDiagram] = useState<Diagram>();
    const [status, setStatus] = useState('Loading repository…');
    const [blocked, setBlocked] = useState(false);
    const state = useRef({
        snapshot: undefined as RepositorySnapshot | undefined,
        diagramId: '',
        current: undefined as RepositoryLayout | undefined,
        saved: '',
        inFlight: undefined as { id: number; json: string } | undefined,
        nextId: 0,
        blocked: false,
        loading: false,
        generation: 0,
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
    });

    const save = useCallback(() => {
        const s = state.current;
        clearTimeout(s.timer);
        if (!s.snapshot || !s.current || s.blocked || s.loading || s.inFlight)
            return;
        const json = serializeLayout(s.current);
        if (json === s.saved) return;
        const id = ++s.nextId;
        s.inFlight = { id, json };
        setStatus('Saving layout…');
        vscode.postMessage({
            type: 'save',
            requestId: id,
            revision: s.snapshot.revision,
            layout: s.current,
        });
    }, []);

    const onChange = useCallback(
        (nextDiagram: Diagram) => {
            const s = state.current;
            if (!s.snapshot || s.loading || nextDiagram.id !== s.diagramId)
                return;
            s.current = extractLayout(
                nextDiagram,
                s.current ?? s.snapshot.layout
            );
            vscode.postMessage({
                type: 'draft',
                dirty: serializeLayout(s.current) !== s.saved || !!s.inFlight,
                revision: s.snapshot.revision,
                layout: s.current,
            });
            if (serializeLayout(s.current) === s.saved || s.blocked) return;
            setStatus(s.inFlight ? 'Saving layout…' : 'Unsaved layout changes');
            clearTimeout(s.timer);
            s.timer = setTimeout(save, 500);
        },
        [save]
    );

    const reload = useCallback(() => {
        const s = state.current;
        vscode.postMessage({
            type: 'reload',
            dirty: !!s.current && serializeLayout(s.current) !== s.saved,
        });
    }, []);

    useEffect(() => {
        const sessionState = state.current;
        const onMessage = async (event: MessageEvent<HostMessage>) => {
            const message = event.data;
            const s = state.current;
            if (message.type === 'saved') {
                if (s.inFlight?.id !== message.requestId || !s.snapshot) return;
                s.saved = s.inFlight.json;
                s.snapshot.revision = message.revision;
                s.inFlight = undefined;
                if (!s.blocked) {
                    setStatus('Layout saved');
                    save(); // An edit may have arrived while the previous save was in flight.
                }
            } else if (message.type === 'error') {
                if (
                    message.requestId !== undefined &&
                    s.inFlight?.id !== message.requestId
                )
                    return;
                s.inFlight = undefined;
                s.blocked = true;
                setBlocked(true);
                setStatus(message.message);
            } else if (message.type === 'snapshot') {
                const dirty =
                    !!s.current && serializeLayout(s.current) !== s.saved;
                if (!message.discard && (dirty || s.inFlight)) {
                    s.blocked = true;
                    setBlocked(true);
                    setStatus(
                        'Repository files changed. Reload to use them; unsaved layout changes will be discarded.'
                    );
                    return;
                }
                clearTimeout(s.timer);
                const generation = ++s.generation;
                s.loading = true;
                setBlocked(true);
                setStatus('Reading DBML…');
                try {
                    const parsed = await importDBMLToDiagram(
                        normalizeGeneratedNotes(message.snapshot.dbml),
                        {
                            databaseType: message.snapshot.databaseType,
                        }
                    );
                    if (generation !== s.generation) return;
                    const loaded = applyLayout(
                        { ...parsed, name: message.snapshot.name },
                        message.snapshot.layout
                    );
                    s.snapshot = message.snapshot;
                    s.current = extractLayout(loaded, message.snapshot.layout);
                    s.saved = message.snapshot.needsInitialSave
                        ? ''
                        : serializeLayout(s.current);
                    s.diagramId = loaded.id;
                    s.inFlight = undefined;
                    s.blocked = false;
                    s.loading = false;
                    setDiagram(loaded);
                    setBlocked(false);
                    setStatus('Layout saved · schema read-only');
                    // Create a missing layout file, including presentation migrated from an export.
                    if (message.snapshot.needsInitialSave) save();
                } catch (error) {
                    if (generation !== s.generation) return;
                    s.loading = false;
                    s.blocked = true;
                    setBlocked(true);
                    setStatus(
                        `Cannot read DBML: ${describeDBMLError(error)}. Fix the source and reload.`
                    );
                }
            }
        };
        window.addEventListener('message', onMessage);
        vscode.postMessage({ type: 'ready' });
        return () => {
            window.removeEventListener('message', onMessage);
            clearTimeout(sessionState.timer);
        };
    }, [save]);

    if (!diagram)
        return (
            <main className="p-6">
                <p role="status">{status}</p>
                <button onClick={reload}>Reload repository</button>
            </main>
        );

    return (
        <HelmetProvider>
            <TooltipProvider>
                <MemoryRouter>
                    <RepositoryContext.Provider
                        value={{
                            diagram,
                            status,
                            blocked,
                            onChange,
                            reload,
                            save,
                        }}
                    >
                        <EditorPage />
                    </RepositoryContext.Provider>
                </MemoryRouter>
            </TooltipProvider>
        </HelmetProvider>
    );
}
