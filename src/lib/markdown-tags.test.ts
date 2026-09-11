import { describe, expect, test } from 'bun:test';
import MarkdownIt from 'markdown-it';
import markdownItContainer from 'markdown-it-container';
import markdownItAttrs from 'markdown-it-attrs';

function createMarkdownRenderer() {
    const md = new MarkdownIt({ html: true, linkify: true })
        .use(markdownItAttrs, {
            leftDelimiter: '{',
            rightDelimiter: '}',
            allowedAttributes: ['class', 'width', 'height', 'style', 'id', 'align'],
        });

    ['info', 'warning', 'danger'].forEach((type) => {
        md.use(markdownItContainer, type, {
            render(tokens: any[], idx: number) {
                const token = tokens[idx];
                if (token.nesting === 1) {
                    return `<div class="callout callout-${type}" role="alert">\n`;
                }
                return '</div>\n';
            },
        });
    });

    md.use(markdownItContainer, 'row', {
        render(tokens: any[], idx: number) {
            const token = tokens[idx];
            if (token.nesting === 1) {
                return `<div class="callout-row row">\n`;
            }
            return '</div>\n';
        },
    });

    return md;
}

describe('Custom Markdown Tags & Callout Tests', () => {
    const md = createMarkdownRenderer();

    test('renders ::: info callout box', () => {
        const input = `::: info\nCommunity meeting tomorrow\n:::`;
        const output = md.render(input);
        expect(output).toContain('<div class="callout callout-info" role="alert">');
        expect(output).toContain('Community meeting tomorrow');
        expect(output).toContain('</div>');
    });

    test('renders ::: warning callout box', () => {
        const input = `::: warning\nPool closed for maintenance\n:::`;
        const output = md.render(input);
        expect(output).toContain('<div class="callout callout-warning" role="alert">');
        expect(output).toContain('Pool closed for maintenance');
    });

    test('renders ::: danger callout box', () => {
        const input = `::: danger\nDo not share magic links\n:::`;
        const output = md.render(input);
        expect(output).toContain('<div class="callout callout-danger" role="alert">');
        expect(output).toContain('Do not share magic links');
    });

    test('renders ::: row container for image grid', () => {
        const input = `::: row\n![Photo 1](/image1.jpg)\n![Photo 2](/image2.jpg)\n:::`;
        const output = md.render(input);
        expect(output).toContain('<div class="callout-row row">');
        expect(output).toContain('src="/image1.jpg"');
        expect(output).toContain('src="/image2.jpg"');
        expect(output).toContain('</div>');
    });

    test('renders image attributes like width and class with markdown-it-attrs', () => {
        const input = `![Park Hill Sign](/images/sign.jpg){width=300 class="img-rounded"}`;
        const output = md.render(input);
        expect(output).toContain('src="/images/sign.jpg"');
        expect(output).toContain('width="300"');
        expect(output).toContain('class="img-rounded"');
    });

    test('renders alignment classes for text headings and images', () => {
        const input = `Plain text {.text-center}\n\n## Heading {.text-right}\n\n![Sign](/images/sign.jpg){width=300 class="img-rounded img-left"}`;
        const output = md.render(input);
        expect(output).toContain('<p class="text-center">Plain text</p>');
        expect(output).toContain('<h2 class="text-right">Heading</h2>');
        expect(output).toContain('class="img-rounded img-left"');
    });
});
