// Shared fetch helpers for the Document Library reader routes, used by both
// the in-page link-click modal (MarkdownPreview) and the full-page fallback
// views that back the same /library/... URLs for direct navigation.

export interface LibraryDocument {
    id: number;
    name: string;
    mimeType: string;
    sizeBytes: number;
}

export interface LibraryDocumentDetail extends LibraryDocument {
    description: string | null;
    url: string;
}

export interface LibraryFolder {
    folder: { id: number; name: string; description: string | null };
    documents: LibraryDocument[];
}

export async function fetchLibraryDocument(id: number): Promise<LibraryDocumentDetail | null> {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as LibraryDocumentDetail;
}

export async function fetchLibraryFolder(id: number): Promise<LibraryFolder | null> {
    const res = await fetch(`/api/documents/folder/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as LibraryFolder;
}

export function isInlineViewable(mimeType: string): boolean {
    return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Matches the internal link convention emitted for folder/document markdown links.
const DOCUMENT_LINK_PATTERN = /^\/library\/documents\/(\d+)$/;
const FOLDER_LINK_PATTERN = /^\/library\/folders\/(\d+)$/;

export function parseLibraryLink(pathname: string): { kind: 'document' | 'folder'; id: number } | null {
    const docMatch = pathname.match(DOCUMENT_LINK_PATTERN);
    if (docMatch) return { kind: 'document', id: Number(docMatch[1]) };
    const folderMatch = pathname.match(FOLDER_LINK_PATTERN);
    if (folderMatch) return { kind: 'folder', id: Number(folderMatch[1]) };
    return null;
}
