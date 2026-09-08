# Admin Menus

## Navigation
- menus are how the users navigate the user defined pages

# Summary
- menus are used to navigate the pages
- menus are folders that contain other menus or pages
- menus by default are presented as cards on the home page
- contain an icon, a title, and optionally a description

# Authorization
- menus can only be managed by Page-Editors or above

# Administration of Menus
- Menu editor is found in the administration section of the application.
- defaults to a list of menus
- button to add a new menu
- button to show visual hierarchy editor
- button on each item to delete the menu
- button on each item to edit the menu
- button on each item to manage the visibility of the menu
- menus can be created, edited, and deleted by administrators
- each menu can have an icon, title, and description
- menus can contain other menus or pages as children

# Menu Visibility
- like pages menus can be made public and shown to non-authenticated users.
- any menu can contain a mix of public and private submenus and pages
- if a public menu contains private content then the private content is not displayed in the public view
- menus default to draft and need to be published to be visible to any users.

# Heirchy and Order
- menus can be nested to create a hierarchy
- the order of menus can be managed by administrators to control their presentation on the home page
- multiple menus can be at the lowest level and show directly on the home page cards.
- pages can also be at the lowest level and show directly on the home page cards.
- a page can be on multiple menus and show directly on the home page cards.

# Menu Editor
- the menu editor allows administrators to create, edit, and delete menus
- administrators can set the icon, title, and description for each menu
- the editor provides a way to manage the hierarchy and order of menus
- drag and drop to reorder menus and change their hierarchy
- changes are automatically saved
- pages can be added as children to menus
- pages can be drag and dropped to set the order within their parent menu
- changes to page order are automatically saved

# Menu Editor Visual
- show a vertical list of menu titles
- pages and submenus should be indented to show their hierarchy
- drag and drop handles should be visible for reordering menus and pages
- changes made through the visual editor should be automatically saved
- the visual editor should provide clear feedback when changes are saved
- each item in the visual editor should have an edit icon to allow quick modifications

# Pages integration
- use the existing pages table to select pages in a popup panel showing pages Title and other relevant details.
- selected pages can be added as children to menus
- the order of pages within a menu can be managed through drag and drop in the menu editor

# Presentation
- menus are presented as cards on the home page by default
- when a menu is clicked the home page changes to show the contents of that menu, including any submenus and pages it contains.
- when a page is clicked within a menu, the home page changes to show the contents of that page. with a back button to return to the previous menu.
- all levels should still show the HOME button to allow users to return to the main home page.