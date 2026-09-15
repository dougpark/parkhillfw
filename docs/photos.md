# Photos
- mobile and desktop friendly
- Admin -> Site Content -> Photos - for managing photo folders and events
- Photos are stored in R2 under the `/photos/{folder}/{event}` folder structure.

# Terminology
- Photo Gallery: A page that shows all the folders and events with photo previews and links to the individual event pages. 
- Photo Folder: A container for organizing related photo events.
- Photo Event: A specific event within a photo folder that contains photos.
- Photo: An individual image within a photo event.
   
# Pages Navigation
- on the Admin -> Site Content -> Navigation page add a button to add a Photo Event page (list and search), then be able to place it anywhere in the site's navigation structure

# Photo Gallery
- a page that shows all the folders and events with photo previews and links to the individual event pages

# Photo Event Page
- shows the name, description, date, and photos for a specific event
- photos should show large-square-thumbnails in tight rows and columns
- click on a thumbnail for full size view with left right navigation

# Admin Photos
- UI List of all photo folders and event pages with options to edit or delete each page or add a new event page
- UI to add a folder with name (creates new R2 /photos/{folder} folder)
- No nested folders within a photo folder are allowed.
- UI to delete a folder (removes R2 /photos/{folder} folder and all its contents)
- UI to rename a folder (updates R2 /photos/{folder} folder name)
- UI to add an event to a folder (creates new R2 /photos/{folder}/{event} folder)
- UI to delete an event from a folder (removes R2 /photos/{folder}/{event} folder and all its contents)
- UI to rename an event in a folder (updates R2 /photos/{folder}/{event} folder name)
- UI to move an event from one folder to another (updates R2 /photos/{folder}/{event} folder location)
- UI to move a photo from one event to another (updates R2 /photos/{folder}/{event}/{photo} location)
- UI Event-Edit page for each event with options to upload or remove photos
- event name
- event slug (slug is the URL-friendly version of the event name)
- event date
- event description
- Supports drag and drop or multiple photo uploads for each event page
- select photo for the event cover image to use for the event preview in the photo gallery

