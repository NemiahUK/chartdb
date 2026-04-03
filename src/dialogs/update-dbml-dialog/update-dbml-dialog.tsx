import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/dialog/dialog';
import { useDialog } from '@/hooks/use-dialog';
import { ImportDatabase } from '../common/import-database/import-database';
import type { BaseDialogProps } from '../common/base-dialog-props';
import { useChartDB } from '@/hooks/use-chartdb';
import { importDBMLToDiagram } from '@/lib/dbml/dbml-import/dbml-import';
import { applyDBMLChanges } from '@/lib/dbml/apply-dbml/apply-dbml';
import type { DatabaseEdition } from '@/lib/domain/database-edition';

export interface UpdateDBMLDialogProps extends BaseDialogProps {}

export const UpdateDBMLDialog: React.FC<UpdateDBMLDialogProps> = ({
    dialog,
}) => {
    const { closeUpdateDBMLDialog } = useDialog();
    const { currentDiagram, databaseType, updateDiagramData } = useChartDB();
    const [scriptResult, setScriptResult] = useState('');
    const [databaseEdition, setDatabaseEdition] = useState<
        DatabaseEdition | undefined
    >(currentDiagram.databaseEdition);

    useEffect(() => {
        if (!dialog.open) {
            return;
        }

        setScriptResult('');
        setDatabaseEdition(currentDiagram.databaseEdition);
    }, [dialog.open, currentDiagram.databaseEdition]);

    const handleImport = useCallback(async () => {
        const diagramFromDBML = await importDBMLToDiagram(scriptResult, {
            databaseType,
        });

        const mergedDiagram = applyDBMLChanges({
            sourceDiagram: currentDiagram,
            targetDiagram: {
                ...currentDiagram,
                tables: diagramFromDBML.tables,
                relationships: diagramFromDBML.relationships,
                dependencies: diagramFromDBML.dependencies,
                customTypes: diagramFromDBML.customTypes,
            },
        });

        await updateDiagramData(
            {
                ...mergedDiagram,
                updatedAt: new Date(),
            },
            { forceUpdateStorage: true }
        );

        closeUpdateDBMLDialog();
    }, [
        scriptResult,
        databaseType,
        currentDiagram,
        updateDiagramData,
        closeUpdateDBMLDialog,
    ]);

    return (
        <Dialog
            {...dialog}
            onOpenChange={(open) => {
                if (!open) {
                    closeUpdateDBMLDialog();
                }
            }}
        >
            <DialogContent
                className="flex max-h-screen w-full flex-col md:max-w-[900px]"
                showClose
            >
                <ImportDatabase
                    databaseType={databaseType}
                    databaseEdition={databaseEdition}
                    setDatabaseEdition={setDatabaseEdition}
                    onImport={handleImport}
                    scriptResult={scriptResult}
                    setScriptResult={setScriptResult}
                    keepDialogAfterImport
                    title="Update Diagram from DBML"
                    importMethod="dbml"
                    setImportMethod={() => undefined}
                    importMethods={['dbml']}
                />
            </DialogContent>
        </Dialog>
    );
};
