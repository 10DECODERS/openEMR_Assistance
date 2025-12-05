# How to Test Your Updated Extension

## Step 1: Reload the Extension

1. Open Chrome and go to: `chrome://extensions/`
2. Make sure "Developer mode" is ON (toggle in top-right)
3. Find "SOAP Assistant" in the list
4. Click the **refresh/reload icon** (circular arrow)

## Step 2: Open a Test Page

**Important**: The extension won't work on Chrome's internal pages (like chrome://extensions/)

Open any regular webpage, for example:
- https://www.google.com
- https://www.wikipedia.org
- Any medical records page you want to test

## Step 3: Click the Extension Icon

1. Look for the SOAP Assistant icon in your Chrome toolbar (top-right)
2. Click it
3. The side panel should slide in from the right
4. The webpage should shift left to make room

## Step 4: Test the Features

1. **Click "Get Content from Page"**
   - Should extract text from the current page
   - Content appears in the textarea

2. **Click "Generate SOAP Note"**
   - Should generate a SOAP note using AI
   - Results appear in tabs (SOAP/Codes)

3. **Click the X button** (top-right of panel)
   - Panel should slide out
   - Page should return to normal width

## What Was Fixed

The error you saw was because:
- The background script tried to send a message before the content script loaded
- Now it checks if the content script exists
- If not, it injects it automatically
- Then sends the toggle message

## If You Still See Errors

1. **Check the browser console**:
   - Right-click on the page → Inspect → Console tab
   - Look for any error messages

2. **Check the extension console**:
   - Go to `chrome://extensions/`
   - Find SOAP Assistant
   - Click "Inspect views: service worker"
   - Check for errors

3. **Common issues**:
   - Make sure all files are in the extension folder
   - Verify you reloaded the extension
   - Try a different webpage (not chrome:// pages)

## File Structure

Your extension folder should have these files:
```
openemr_extension/
├── manifest.json          ✓ Updated
├── background.js          ✓ Fixed
├── content.js             ✓ New
├── sidepanel.html         ✓ New
├── sidepanel.css          ✓ New
├── assistant.js           ✓ New
├── options.html           ✓ Existing
├── options.js             ✓ Existing
├── icon.png               ✓ Existing
├── popup.html             (old, not used)
└── popup.js               (old, not used)
```

The old popup files are still there but not used anymore.
