import { describe, expect, test } from 'bun:test';
import { createMarkdownRenderer } from './markdown';

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

    test('turns raw phone numbers into tel links', () => {
        const output = md.render('Call the pool chair at (817) 555-1212 or 817.555.3434 x12.');
        expect(output).toContain('<a href="tel:8175551212">(817) 555-1212</a>');
        expect(output).toContain('<a href="tel:8175553434;ext=12">817.555.3434 x12</a>');
    });

    test('does not relink phone numbers already inside markdown links', () => {
        const output = md.render('[Call us](tel:8175551212)');
        expect(output).toContain('<a href="tel:8175551212">Call us</a>');
        expect(output).not.toContain('tel:8175551212">8175551212</a>');
    });
});
