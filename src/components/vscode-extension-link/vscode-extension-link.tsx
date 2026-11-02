import React from 'react';
import { Code2 } from 'lucide-react';

export const VSCodeExtensionLink: React.FC = () => (
    <a
        href="/vscode"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
        <Code2 className="size-4" aria-hidden="true" />
        VS Code extension
    </a>
);
