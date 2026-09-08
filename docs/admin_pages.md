# Admin Pages Intents

## Security
- must be Page-Editor or higher to manage pages

## Pages List
- initial view shows list of pages with title, author, last edited date, and flags for public or draft status
- edit button opens the page editor for that page
- delete button prompts for confirmation and then deletes the page
- create new page button opens the page editor with a blank page

## Page Editor with Preview Overlay
- shows title, author, last edited date, and button for public or draft status
- shows markdown editor with preview overlay
- shows attachments list with drag and drop support, copy/paste support, and delete button for each attachment
- shows save button that saves the page and attachments, shows highlighted when there are unsaved changes.
- done button closes the editor/preview back to the page list.
- shows publish button that saves the page and attachments and sets draft flag to false 
- Preview button that shows the markdown preview overlay without saving. 
- pasted links to images or attachments should be converted to relative links in the markdown
- images and attachments should be stored in R2 and linked in the markdown with relative paths

## Tech Stack
- markdown editor codemirror
- markdown viewer markdown-it + github-markdown-css
- default to Github markdown flavor with support for tables, code blocks, and images

## Editor View
![alt text](admin_pages_toolbar.png)
- create a editor toolbar with buttons for bold, italic, underline, heading, code, link, image, table, and bullet list, toggle check list 
- support paste images from clipboard and drag and drop images into the editor
- support paste links to images and attachments and convert them to relative links in the markdown
- toggle check list is a 3 state button that cycles through unchecked, checked, remove checklist formatting
- heading button is a 3 state button that cycles through h1, h2, h3, and removes heading formatting

## Preview View
- images should be displayed with a max width of 100% and maintain aspect ratio and centered horizontally.
- Preview should be usable on site presentation. can the same code be used for both views of the page? 

## Attachments View
- all attachments should be stored in R2 and linked in the markdown with relative paths
- R2 should be configured to not allow public read access to attachments, only allow access through the app
- links to R2 should be generated with a url that must have an authenticated signed in user session to access the file
- show a list of attachments with thumbnail, name, type, size, and delete button
- icon to copy the relative md link to the attachment