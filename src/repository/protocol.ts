import type { Diagram } from '@/lib/domain/diagram';
import type { DatabaseType } from '@/lib/domain/database-type';
import type { RepositoryLayout } from './layout';

export interface RepositorySnapshot {
    revision: string;
    dbml: string;
    layout: RepositoryLayout;
    name: string;
    databaseType: DatabaseType;
    sourcePath: string;
    layoutPath: string;
    needsInitialSave: boolean;
}

export type HostMessage =
    | { type: 'snapshot'; snapshot: RepositorySnapshot; discard?: boolean }
    | { type: 'saved'; requestId: number; revision: string }
    | { type: 'error'; message: string; requestId?: number };

export type EditorMessage =
    | { type: 'ready' }
    | {
          type: 'draft';
          revision: string;
          layout: RepositoryLayout;
          dirty: boolean;
      }
    | { type: 'reload'; dirty: boolean }
    | {
          type: 'save';
          requestId: number;
          revision: string;
          layout: RepositoryLayout;
      };

export interface RepositoryEditorSession {
    diagram: Diagram;
    status: string;
    blocked: boolean;
    onChange: (diagram: Diagram) => void;
    reload: () => void;
    save: () => void;
}
