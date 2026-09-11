# Mobile Actions on Directory Cards

Mobile contact cards balance quick utility with mis-tap prevention. Providing direct actions—calling, copying, or saving—is standard UX, but how those actions are presented makes all the difference, particularly for older adults or high-density lists.

## Standard Mobile UI Norms & Action Features

• Direct Call (tel: links): Mandatory for mobile UX. Tap-to-call eliminates manual dialing. However, critical numbers should never trigger a call without a native system prompt (e.g., iOS and Android naturally display a prompt like "Call (817) 555-0199?" before placing the call).

• Copy to Clipboard: Highly valuable for numbers, physical addresses, and emails. Include a explicit visual feedback cue (e.g., changing the button icon to a checkmark or showing a toast message: "Copied to clipboard").

• Add to Contacts (.vcf / vCard download): Essential for directory apps. Providing a dedicated "Save Contact" button that downloads or opens a .vcf file lets users import details directly into their phone's native address book.

## UI Strategies: Structuring Contact Cards

To prevent visual clutter while keeping primary actions accessible:


### Action Rows (Icon + Label)	
Dedicated row of distinct action chips (Call, Copy, Save) under the contact details.

Best Used For
General directory lists and full contact cards.

### Modal / Detail View	
Tapping a row opens a modal or sub-page containing full actions; the main list is read-only text.

Best Used For
High-density directory lists to completely eliminate accidental calls.

## Confirmation Step	
Custom modal or relying on native tel: prompts to ensure accidental taps are easily canceled.

Emergency numbers or key neighborhood contacts.

## Preventing Accidental Taps While Scrolling

Mobile browsers handle tap versus scroll automatically by monitoring touch displacement: if a user's finger moves more than a few pixels vertically during touchstart, the browser flags it as a scroll (touchmove) and suppresses the click event.
However, mis-taps still happen due to layout choices or poor target spacing. Use these technical and design guardrails to guarantee safe scrolling:
• Separate Touch Targets from Scroll Areas: Do not make an entire directory row a direct tel: link. Make the card row open a detail view (or do nothing), while dedicating a specific, localized button (e.g., a distinct phone icon on the far right) for dialing.
• Maintain Buffer Padding: Keep at least 8px to 12px of non-interactive white space between tappable elements so a sliding thumb doesn't land on adjacent actions.
• Enforce Touch Target Sizes: Ensure tappable buttons hit the standard 44×44px (iOS) or 48×48px (Android/WCAG) target area, but keep the visual graphic inside it bounded so buttons don't bleed into scroll zones.
• Prevent Double-Tap Zoom Delays: Add touch-action: manipulation; to your CSS for interactive buttons. This disables double-tap zoom delay on buttons, making tap detection distinct and crisp for the browser.
/* Apply to all touch targets in the directory */
.contact-action-btn {
  touch-action: manipulation;
  min-width: 48px;
  min-height: 48px;
}

• Rely on Native tel: Behavior: Never bypass standard links with immediate JavaScript redirects. Standard <a href="tel:..."> links trigger the operating system's built-in confirmation modal, providing a mandatory safety net before a call connects.
