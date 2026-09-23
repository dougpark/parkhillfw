# Excel and CSV Export from Cloudflare Workers

Yes, you can natively export binary .xlsx files directly from Cloudflare Workers without using external backend servers. However, because Cloudflare Workers run on V8 isolates rather than a full Node.js runtime environment, your choice of library depends on how you configure the Worker.

## Cloudflare-Compatible Libraries

-	xlsx (SheetJS)
•	Worker Compatibility: Native zero-dependency JavaScript build works out of the box in Edge runtimes.
•	Best For: Fast generation of standard .xlsx files without heavy styling needs.

