import type { EditorView } from '@codemirror/view';

export type MarkdownCommand =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'heading'
    | 'code'
    | 'link'
    | 'image'
    | 'table'
    | 'bullet'
    | 'checklist'
    | 'callout-info'
    | 'callout-warning'
    | 'callout-danger'
    | 'row'
    | 'align';

type Alignment = 'left' | 'center' | 'right';
const alignmentOrder: Alignment[] = ['left', 'center', 'right'];
const blockAlignmentClasses = ['text-left', 'text-center', 'text-right'];
const imageAlignmentClasses = ['img-left', 'img-center', 'img-right'];

function wrapSelection(view: EditorView, before: string, after: string, placeholder = 'text'): void {
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc;
    const selected = doc.sliceString(from, to);

    const alreadyWrapped =
        from >= before.length &&
        doc.sliceString(from - before.length, from) === before &&
        doc.sliceString(to, Math.min(to + after.length, doc.length)) === after;

    if (alreadyWrapped && selected) {
        view.dispatch({
            changes: [
                { from: to, to: to + after.length, insert: '' },
                { from: from - before.length, to: from, insert: '' },
            ],
            selection: { anchor: from - before.length, head: to - before.length },
        });
    } else {
        const text = selected || placeholder;
        view.dispatch({
            changes: { from, to, insert: `${before}${text}${after}` },
            selection: { anchor: from + before.length, head: from + before.length + text.length },
        });
    }
    view.focus();
}

function selectedLineNumbers(view: EditorView): number[] {
    const { from, to } = view.state.selection.main;
    const start = view.state.doc.lineAt(from);
    const end = view.state.doc.lineAt(Math.min(to, view.state.doc.length));
    const numbers: number[] = [];
    for (let lineNo = start.number; lineNo <= end.number; lineNo++) numbers.push(lineNo);
    return numbers;
}

function classForAlignment(alignment: Alignment, target: 'block' | 'image'): string {
    return target === 'image' ? `img-${alignment}` : `text-${alignment}`;
}

function nextAlignment(current: Alignment | null): Alignment {
    if (!current) return 'left';
    const index = alignmentOrder.indexOf(current);
    return alignmentOrder[(index + 1) % alignmentOrder.length]!;
}

function parseClassAttribute(attrs: string): string[] {
    const match = attrs.match(/(?:^|\s)class=(['"])(.*?)\1/);
    return match ? match[2]!.split(/\s+/).filter(Boolean) : [];
}

function alignmentFromClasses(classes: string[]): Alignment | null {
    if (classes.includes('text-left') || classes.includes('img-left')) return 'left';
    if (classes.includes('text-center') || classes.includes('img-center')) return 'center';
    if (classes.includes('text-right') || classes.includes('img-right')) return 'right';
    return null;
}

function upsertClassAttribute(attrs: string, className: string, target: 'block' | 'image'): string {
    const classes = parseClassAttribute(attrs)
        .filter((name) => !blockAlignmentClasses.includes(name) && !imageAlignmentClasses.includes(name));
    classes.push(className);

    if (/(?:^|\s)class=(['"])(.*?)\1/.test(attrs)) {
        return attrs.replace(/(?:^|\s)class=(['"])(.*?)\1/, ` class="${classes.join(' ')}"`).trim();
    }

    return `${attrs.trim()} class="${classes.join(' ')}"`.trim();
}

function alignImageLine(text: string, alignment: Alignment): string {
    const imageAttrs = text.match(/^(.*!\[[^\]]*\]\([^)]*\))(?:\{([^}]*)\})?(.*)$/);
    if (!imageAttrs) return text;

    const [, imageMarkdown, attrs = '', after = ''] = imageAttrs;
    const nextAttrs = upsertClassAttribute(attrs, classForAlignment(alignment, 'image'), 'image');
    return `${imageMarkdown}{${nextAttrs}}${after}`;
}

function alignBlockLine(text: string, alignment: Alignment): string {
    const blockAttrs = text.match(/^(.*?)(?:\s*\{([^}]*)\})?\s*$/);
    if (!blockAttrs) return text;

    const [, content, attrs = ''] = blockAttrs;
    const nextAttrs = upsertClassAttribute(attrs, classForAlignment(alignment, 'block'), 'block');
    return `${content.trimEnd()} {${nextAttrs}}`;
}

function currentAlignmentForLine(text: string): Alignment | null {
    const attrs = text.match(/\{([^}]*)\}\s*$/)?.[1] ?? '';
    return alignmentFromClasses(parseClassAttribute(attrs));
}

function cycleAlignment(view: EditorView): void {
    const lines = selectedLineNumbers(view)
        .map((lineNo) => view.state.doc.line(lineNo))
        .filter((line) => line.text.trim());
    if (!lines.length) return;

    const target = nextAlignment(currentAlignmentForLine(lines[0]!.text));
    const changes = lines.map((line) => {
        const replacement = /!\[[^\]]*\]\([^)]*\)/.test(line.text)
            ? alignImageLine(line.text, target)
            : alignBlockLine(line.text, target);
        return { from: line.from, to: line.to, insert: replacement };
    });

    view.dispatch({ changes });
    view.focus();
}

function cycleHeading(view: EditorView): void {
    const lineNumbers = selectedLineNumbers(view);
    const firstLine = view.state.doc.line(lineNumbers[0]!);
    const current = firstLine.text.match(/^#{1,6}(?=\s)/);
    const level = current ? current[0].length : 0;
    const next = level >= 3 ? 0 : level + 1;

    const changes = [];
    for (const lineNo of lineNumbers) {
        const line = view.state.doc.line(lineNo);
        if (!line.text.trim()) continue;
        const stripped = line.text.replace(/^#{1,6}\s+/, '');
        const replacement = next === 0 ? stripped : `${'#'.repeat(next)} ${stripped}`;
        if (replacement !== line.text) changes.push({ from: line.from, to: line.to, insert: replacement });
    }
    if (changes.length) view.dispatch({ changes });
    view.focus();
}

function toggleBullet(view: EditorView): void {
    const lines = selectedLineNumbers(view)
        .map((lineNo) => view.state.doc.line(lineNo))
        .filter((line) => line.text.trim());
    if (!lines.length) return;
    const allBulleted = lines.every((line) => /^\s*-\s/.test(line.text));
    const changes = lines.map((line) => {
        if (allBulleted) {
            return { from: line.from, to: line.to, insert: line.text.replace(/^(\s*)-\s+/, '$1') };
        }
        return /^\s*-\s/.test(line.text)
            ? { from: line.from, to: line.to, insert: line.text }
            : { from: line.from, to: line.to, insert: `- ${line.text}` };
    });
    view.dispatch({ changes });
    view.focus();
}

// Three-state cycle driven by the first selected line:
// plain/bullet -> unchecked (`- [ ]`) -> checked (`- [x]`) -> plain text.
function cycleChecklist(view: EditorView): void {
    const lines = selectedLineNumbers(view)
        .map((lineNo) => view.state.doc.line(lineNo))
        .filter((line) => line.text.trim());
    if (!lines.length) return;

    const first = lines[0]!.text;
    const target: 'unchecked' | 'checked' | 'plain' = /^\s*- \[ \]/.test(first)
        ? 'checked'
        : /^\s*- \[x\]/i.test(first)
            ? 'plain'
            : 'unchecked';

    const changes = lines.map((line) => {
        const indent = line.text.match(/^\s*/)?.[0] ?? '';
        const content = line.text
            .slice(indent.length)
            .replace(/^- \[(?: |x)\]\s+/i, '')
            .replace(/^-\s+/, '');
        const replacement =
            target === 'plain'
                ? `${indent}${content}`
                : `${indent}- [${target === 'checked' ? 'x' : ' '}] ${content}`;
        return { from: line.from, to: line.to, insert: replacement };
    });
    view.dispatch({ changes });
    view.focus();
}

function toggleCode(view: EditorView): void {
    const { from, to } = view.state.selection.main;
    const selected = view.state.doc.sliceString(from, to);
    if (selected.includes('\n')) wrapSelection(view, '```\n', '\n```', 'code');
    else wrapSelection(view, '`', '`', 'code');
}

function insertLink(view: EditorView): void {
    const { from, to } = view.state.selection.main;
    const selected = view.state.doc.sliceString(from, to);
    const isUrl = /^https?:\/\/\S+$/.test(selected);
    const insert = isUrl ? `[link text](${selected})` : `[${selected || 'link text'}](https://)`;
    view.dispatch({
        changes: { from, to, insert },
        selection: isUrl
            ? { anchor: from + 1, head: from + 1 + 'link text'.length }
            : { anchor: from + insert.length - 'https://)'.length, head: from + insert.length - 1 },
    });
    view.focus();
}

function insertImage(view: EditorView): void {
    const { from, to } = view.state.selection.main;
    const insert = '![alt text](/api/files/)';
    view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 2, head: from + 2 + 'alt text'.length },
    });
    view.focus();
}

function insertTable(view: EditorView): void {
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const template = `| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |`;
    const leadingBreaks = line.text.trim() ? '\n\n' : '\n';
    const insertAt = line.to;
    view.dispatch({
        changes: { from: insertAt, insert: `${leadingBreaks}${template}\n` },
        selection: { anchor: insertAt + leadingBreaks.length + 2, head: insertAt + leadingBreaks.length + 2 + 'Column 1'.length },
    });
    view.focus();
}

function insertCallout(view: EditorView, type: 'info' | 'warning' | 'danger'): void {
    const { from, to } = view.state.selection.main;
    const selected = view.state.doc.sliceString(from, to).trim();
    const content = selected || 'Important note text goes here...';
    const insert = `::: ${type}\n${content}\n:::`;
    view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + type.length + 5, head: from + type.length + 5 + content.length },
    });
    view.focus();
}

function insertRow(view: EditorView): void {
    const { from, to } = view.state.selection.main;
    const selected = view.state.doc.sliceString(from, to).trim();
    const content = selected || '![Photo 1](/api/files/example1.jpg){class="img-thumb"}\n![Photo 2](/api/files/example2.jpg){class="img-thumb"}';
    const insert = `::: row\n${content}\n:::`;
    view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 8, head: from + 8 + content.length },
    });
    view.focus();
}

export function applyMarkdownCommand(view: EditorView, command: MarkdownCommand): void {
    switch (command) {
        case 'bold': return wrapSelection(view, '**', '**');
        case 'italic': return wrapSelection(view, '*', '*');
        case 'underline': return wrapSelection(view, '<u>', '</u>');
        case 'heading': return cycleHeading(view);
        case 'code': return toggleCode(view);
        case 'link': return insertLink(view);
        case 'image': return insertImage(view);
        case 'table': return insertTable(view);
        case 'bullet': return toggleBullet(view);
        case 'checklist': return cycleChecklist(view);
        case 'callout-info': return insertCallout(view, 'info');
        case 'callout-warning': return insertCallout(view, 'warning');
        case 'callout-danger': return insertCallout(view, 'danger');
        case 'row': return insertRow(view);
        case 'align': return cycleAlignment(view);
    }
}
