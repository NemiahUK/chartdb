import { parseDBMLError } from '@/lib/dbml/dbml-import/dbml-import-error';

// prisma-dbml-generator can emit table notes spanning literal newlines inside
// single quotes. DBML's current parser requires triple quotes for those notes.
// Normalize just this generated form in memory; never rewrite the source file.
export function normalizeGeneratedNotes(content: string): string {
    return content.replace(
        /(^[ \t]*Note:[ \t]*)'(?!')((?:\\[\s\S]|[^'\\])*)'/gim,
        (match, prefix: string, body: string) =>
            body.includes('\n') ? `${prefix}'''${body}'''` : match
    );
}

export function describeDBMLError(error: unknown): string {
    const diagnostic = parseDBMLError(error);
    if (diagnostic)
        return `line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}`;
    return error instanceof Error ? error.message : String(error);
}
