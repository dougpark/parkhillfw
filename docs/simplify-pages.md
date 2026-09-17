# Simplify content creation for pages
- the UI and backend are working well individually
- however there is a need to streamline the page management into a consolidated interface.
- the goal is to make the Site-Content -> Navigation -> List View page have complete and intuitive content management capabilities.

## Menu system 
- the site menu system and navigation added the concept of meta-data about the pages, it gives structure to the position of pages on the site. this meta-data view has become difficult to manage and understand for content creators.

## Hierarchy Page
- The Hierarchy Page will primarily serve as a structural overview of the site's navigation, while detailed content management will be handled in the List View page.
- Move the row-level meta-data edit button (pencil icon) to the List View row-level action for easier access and management. pick a new icon for this action that is distinct from the pencil icon.
- remove the row-level delete action for easier management and to prevent accidental deletions.

## List View Page
- the List View page is close to being able to manage the whole content process

### Action Bar Buttons
- create a new button called "+ Add Item" that triggers a popup.
- move the "Add page" button into the "+ Add Item" popup rename button to "Insert Page" since it is not creating a new page but just inserting an existing page into the navigation hierarchy.
- move the "Add Link" button into the "+ Add Item" popup rename button to "New Link".
- move the "New Menu" button into the "+ Add Item" popup.
- create a new "New Page" button in the "+ Add Item" popup, with a quick add panel to get the Title and create a new page. Similar to the "New Page" action in the Site-Content -> Pages section.
- since there is no row context for this "+ Add Item" action in the action bar, it will default to adding new items at the top level of the navigation hierarchy at the bottom of the list.

### Row-level action buttons
- In the menu row replace the "Add page" button with the "Add Item" button and popup. All newly added items should be inserted directly below the current item in the navigation structure.
- each row needs the existing "published" toggle to control and show the visibility of the row 
- the newly added edit meta-data button should be present in each row to allow quick access to edit the page's meta-information.
- if the row represents a page, the row should also include a second icon to edit the page content itself, similar to the current List View implementation.
- keep the existing delete icon for each row to allow removal of items from the navigation hierarchy.


# Rename the switch view button
- rename the "Hierarchy Editor" button to "Reorder Mode" view for better clarity.
- rename the "List View" button to "Edit Mode" view for better clarity.
