import { createContext, useContext } from 'react';
import type { RepositoryEditorSession } from './protocol';

export const RepositoryContext = createContext<
    RepositoryEditorSession | undefined
>(undefined);
export const useRepository = () => useContext(RepositoryContext);
