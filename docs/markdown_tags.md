# Custom Markdown Enhancements

Yes, you can absolutely create custom callout panels and control image alignment/sizing using markdown-it.
Because base Markdown doesn't support custom container syntax natively, the standard ecosystem approach uses two popular markdown-it plugins: markdown-it-container for callout boxes and markdown-it-attrs (or markdown-it-bracketed-spans) for inline image sizing and layout attributes.

## 1. Custom Callout Message Panels (Info, Warning, Alert)
To parse fenced block syntax like ::: info ... :::, use markdown-it-container.
Installation
bun install markdown-it-container
bun add -d @types/markdown-it-container

Plugin Setup (src/lib/markdown.ts)
import MarkdownIt from 'markdown-it';
import markdownItContainer from 'markdown-it-container';

const md = new MarkdownIt();

// Register alert containers (info, warning, danger)
['info', 'warning', 'danger'].forEach((type) => {
  md.use(markdownItContainer, type, {
    render(tokens, idx) {
      const token = tokens[idx];
      if (token.nesting === 1) {
        // Opening tag: <div class="callout callout-info">
        return `<div class="callout callout-${type}" role="alert">\n`;
      } else {
        // Closing tag
        return '</div>\n';
      }
    },
  });
});

export default md;

Markdown Syntax
::: info
**Note:** The community pool will close early on Friday for maintenance.
:::

::: warning
Please double-check your account details before submitting.
:::

::: danger
Do not share your magic link sign-in emails with anyone.
:::

CSS Styles (callouts.css)
.callout {
  padding: 1rem 1.25rem;
  margin: 1.5rem 0;
  border-left: 5px solid;
  border-radius: 6px;
  background-color: #f8fafc;
}

.callout-info {
  border-color: #22c55e; /* Green */
  background-color: #f0fdf4;
  color: #14532d;
}

.callout-warning {
  border-color: #eab308; /* Yellow */
  background-color: #fefce8;
  color: #713f12;
}

.callout-danger {
  border-color: #ef4444; /* Red */
  background-color: #fef2f2;
  color: #7f1d1d;
}

## 2. Sizing and Row Positioning for Images
Standard Markdown syntax ![alt](url) generates plain <img> tags without classes or dimensions. By adding markdown-it-attrs, you can append custom CSS classes or inline styles directly to your images in Markdown.
Standard Markdown syntax ![alt](url) generates plain <img> tags without classes or dimensions. By adding markdown-it-attrs, you can append custom CSS classes or inline styles directly to your images in Markdown.
Installation
bun add markdown-it-attrs

## 2. Plugin Setup for Image Attributes
### Plugin Setup
import markdownItAttrs from 'markdown-it-attrs';

md.use(markdownItAttrs, {
  leftDelimiter: '{',
  rightDelimiter: '}',
  allowedAttributes: ['class', 'width', 'height', 'style']
});

Markdown Syntax (Sizing & Grid Layouts)
<!-- Single Sized Image -->
![Park Hill Sign](/images/sign.jpg){width=300 class="img-rounded"}

<!-- Row / Flex Grid of Images -->
::: row
![Event 1](/images/photo1.jpg){class="img-thumb"}
![Event 2](/images/photo2.jpg){class="img-thumb"}
![Event 3](/images/photo3.jpg){class="img-thumb"}
:::

CSS Styles for Image Layouts
/* Container for row layout */
.callout-row, div.row {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  margin: 1.5rem 0;
}

/* Image Utilities */
.img-thumb {
  flex: 1;
  max-width: 30%;
  height: auto;
  border-radius: 8px;
  object-fit: cover;
}

.img-rounded {
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

# UI in the Page editor
- add 2 new action icons to the editor page
- In the page editor, these icons will allow users to quickly insert custom callout panels and row layouts for images.
- on Action check for existing highlighted text or cursor position to determine where to insert the callout panel or row layout.

Defaults: (how best to handle default settings for callouts and images)
- callout should default to callout-info
- custom image should default to {width=300 class="img-rounded"} for images 
(not sure how to expose other classes eg {class="img-thumb"})
- or image left, center, right justified.

## Summary of Stack Integration
1. Use markdown-it-container for block callouts (::: info) and row wrappers (::: row).
2. Use markdown-it-attrs for inline image class/size assignments (![alt](url){class="..."}).
3. Define lightweight utility classes in your stylesheet (or Tailwind @apply rules) for colors and flexbox layouts.
Would you like help typing the custom plugin options in TypeScript or setting up the Tailwind CSS classes for these containers?