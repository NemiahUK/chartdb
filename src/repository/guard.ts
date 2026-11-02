import type { ChartDBContext } from '@/context/chartdb-context/chartdb-context';
import { presentationOnly } from './layout';

// Guard the mutation boundary too: menus, shortcuts, undo and future UI controls
// must all obey the schema lock. Loading a host snapshot is a separate trusted path.
export function lockSchema(context: ChartDBContext): ChartDBContext {
    const blocked = async () => {
        throw new Error('Schema is managed by the repository DBML source.');
    };
    return {
        ...context,
        readonly: true,
        updateDiagramId: blocked,
        updateDiagramName: blocked,
        updateDatabaseType: blocked,
        updateDatabaseEdition: blocked,
        clearDiagramData: blocked,
        deleteDiagram: blocked,
        updateDiagramData: blocked,
        loadDiagram: blocked,
        createTable: blocked,
        addTable: blocked,
        addTables: blocked,
        removeTable: blocked,
        removeTables: blocked,
        createField: blocked,
        addField: blocked,
        updateField: blocked,
        removeField: blocked,
        createIndex: blocked,
        addIndex: blocked,
        updateIndex: blocked,
        removeIndex: blocked,
        createCheckConstraint: blocked,
        addCheckConstraint: blocked,
        updateCheckConstraint: blocked,
        removeCheckConstraint: blocked,
        createRelationship: blocked,
        addRelationship: blocked,
        addRelationships: blocked,
        updateRelationship: blocked,
        removeRelationship: blocked,
        removeRelationships: blocked,
        createDependency: blocked,
        addDependency: blocked,
        addDependencies: blocked,
        updateDependency: blocked,
        removeDependency: blocked,
        removeDependencies: blocked,
        createCustomType: blocked,
        addCustomType: blocked,
        addCustomTypes: blocked,
        updateCustomType: blocked,
        removeCustomType: blocked,
        removeCustomTypes: blocked,
        updateTable: (id, attributes, options) =>
            context.updateTable(id, presentationOnly(attributes), options),
        updateTablesState: (update, options) =>
            context.updateTablesState((tables) => {
                const proposed = update(structuredClone(tables));
                return tables.map((table) => {
                    const changes = proposed.find(
                        (candidate) => candidate.id === table.id
                    );
                    return changes
                        ? { ...table, ...presentationOnly(changes) }
                        : table;
                });
            }, options),
    };
}
