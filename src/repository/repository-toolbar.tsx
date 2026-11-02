import React from 'react';
import { useRepository } from './repository-context';
import { useHistory } from '@/hooks/use-history';
import { Button } from '@/components/button/button';

export function RepositoryToolbar() {
    const repository = useRepository();
    const { undo, redo, hasUndo, hasRedo } = useHistory();
    if (!repository) return null;
    return (
        <nav className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm">
            <strong>{repository.diagram.name}</strong>
            <span className="text-muted-foreground">Schema read-only</span>
            <Button
                variant="outline"
                size="sm"
                disabled={!hasUndo || repository.blocked}
                onClick={undo}
            >
                Undo
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={!hasRedo || repository.blocked}
                onClick={redo}
            >
                Redo
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={repository.blocked}
                onClick={repository.save}
            >
                Save layout
            </Button>
            <Button variant="outline" size="sm" onClick={repository.reload}>
                Reload
            </Button>
            <span role="status" className="ml-auto">
                {repository.status}
            </span>
            <span
                title="Based on ChartDB, licensed under AGPL-3.0"
                className="text-xs text-muted-foreground"
            >
                ChartDB · AGPL-3.0
            </span>
        </nav>
    );
}
