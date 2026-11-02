import React, { useEffect } from 'react';
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepository } from '../repository-context';
import type {
    EditorMessage,
    HostMessage,
    RepositorySnapshot,
} from '../protocol';
import { DatabaseType } from '@/lib/domain/database-type';
import { emptyLayout } from '../layout';

const postMessage = vi.fn<(message: EditorMessage) => void>();
vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage }));

vi.mock('@/pages/editor-page/editor-page', () => ({
    EditorPage: () => {
        const repository = useRepository()!;
        const { diagram, onChange } = repository;
        useEffect(() => onChange(diagram), [diagram, onChange]);
        return (
            <>
                <p>{repository.status}</p>
                <span data-testid="fields">
                    {repository.diagram
                        .tables![0].fields.map((f) => f.name)
                        .join(',')}
                </span>
                <button
                    onClick={() =>
                        repository.onChange({
                            ...repository.diagram,
                            tables: repository.diagram.tables!.map((t) => ({
                                ...t,
                                x: t.x + 10,
                            })),
                        })
                    }
                >
                    Move
                </button>
                <button onClick={repository.reload}>Reload</button>
            </>
        );
    },
}));

const { RepositoryApp } = await import('../repository-app');
const snapshot = (): RepositorySnapshot => ({
    revision: 'original',
    dbml: 'Table users {\n id int\n}',
    layout: emptyLayout(),
    name: 'test',
    databaseType: DatabaseType.GENERIC,
    sourcePath: 'schema.dbml',
    layoutPath: 'layout.json',
    needsInitialSave: false,
});
const deliver = async (message: HostMessage) => {
    await act(async () => {
        window.dispatchEvent(new MessageEvent('message', { data: message }));
    });
};
const saves = () =>
    postMessage.mock.calls
        .map(([message]) => message)
        .filter(
            (message): message is Extract<EditorMessage, { type: 'save' }> =>
                message.type === 'save'
        );

beforeEach(() => {
    postMessage.mockClear();
});
afterEach(cleanup);

describe('repository editor session', () => {
    it('does not write during load, saves edits, and refreshes a clean schema', async () => {
        render(<RepositoryApp />);
        await deliver({ type: 'snapshot', snapshot: snapshot() });
        await screen.findByTestId('fields');
        expect(saves()).toHaveLength(0);
        fireEvent.click(screen.getByText('Move'));
        await waitFor(() => expect(saves()).toHaveLength(1));
        const save = saves()[0];
        expect(save.revision).toBe('original');
        await deliver({
            type: 'saved',
            requestId: save.requestId,
            revision: 'saved',
        });
        await deliver({
            type: 'snapshot',
            snapshot: {
                ...snapshot(),
                revision: 'new-schema',
                dbml: 'Table users {\n id int\n email varchar\n}',
                layout: save.layout,
            },
        });
        await waitFor(() =>
            expect(screen.getByTestId('fields').textContent).toBe('id,email')
        );
        expect(saves()).toHaveLength(1);
    });

    it('holds unsaved edits when an external change arrives instead of autosaving over it', async () => {
        render(<RepositoryApp />);
        await deliver({ type: 'snapshot', snapshot: snapshot() });
        fireEvent.click(await screen.findByText('Move'));
        await deliver({
            type: 'snapshot',
            snapshot: {
                ...snapshot(),
                revision: 'external',
                dbml: 'Table users {\n other int\n}',
            },
        });
        await screen.findByText(/Repository files changed/);
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(saves()).toHaveLength(0);
        expect(screen.getByTestId('fields').textContent).toBe('id');
        fireEvent.click(screen.getByText('Reload'));
        expect(postMessage).toHaveBeenCalledWith({
            type: 'reload',
            dirty: true,
        });
        await deliver({
            type: 'snapshot',
            discard: true,
            snapshot: {
                ...snapshot(),
                revision: 'external',
                dbml: 'Table users {\n other int\n}',
            },
        });
        await waitFor(() =>
            expect(screen.getByTestId('fields').textContent).toBe('other')
        );
    });

    it('keeps the last good diagram on invalid DBML and recovers after correction', async () => {
        render(<RepositoryApp />);
        await deliver({ type: 'snapshot', snapshot: snapshot() });
        await screen.findByTestId('fields');
        await deliver({
            type: 'snapshot',
            snapshot: { ...snapshot(), revision: 'broken', dbml: 'Table {' },
        });
        await screen.findByText(/Cannot read DBML/);
        expect(screen.getByTestId('fields').textContent).toBe('id');
        expect(saves()).toHaveLength(0);
        await deliver({
            type: 'snapshot',
            snapshot: { ...snapshot(), revision: 'fixed' },
        });
        await screen.findByText('Layout saved · schema read-only');
    });
});
