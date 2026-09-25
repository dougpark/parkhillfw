# Handle Link-Scanning pre-clicks (If using Magic Links):
•	If you are using magic links, ensure the GET request from the email link displays a simple landing page with a "Click to Confirm Login" button (POST action) rather than logging the user in automatically on GET. This prevents security web crawlers from consuming the token on delivery.

