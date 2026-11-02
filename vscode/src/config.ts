import { z } from 'zod';
import { DatabaseType } from '../../src/lib/domain/database-type';

const relativePath = z
    .string()
    .min(1)
    .refine(
        (path) =>
            !path.startsWith('/') &&
            !path.includes('\\') &&
            !path.includes(':') &&
            !path
                .split('/')
                .some((part) => part === '..' || part === '.' || part === '') &&
            !path.split('/').includes('.git'),
        'Use a relative path inside the workspace, without .. or .git'
    );

export const configSchema = z
    .object({
        version: z.literal(1),
        name: z.string().min(1).optional(),
        schema: relativePath.refine(
            (path) => path.endsWith('.dbml'),
            'Schema must be a .dbml file'
        ),
        layout: relativePath.refine(
            (path) => path.endsWith('.json') && path !== '.chartdb.json',
            'Layout must be a separate .json file'
        ),
        importLayoutFrom: relativePath.optional(),
        databaseType: z.nativeEnum(DatabaseType).default(DatabaseType.GENERIC),
    })
    .strict()
    .refine((config) => config.layout !== config.importLayoutFrom, {
        message: 'Layout must be separate from the existing ChartDB export',
    });
