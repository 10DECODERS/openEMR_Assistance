
## Setup Instructions

### 1. Load Extension in Chrome

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension folder

### 2. Configure Anthropic API Key

**IMPORTANT**: You need an Anthropic API key to use the AI features.

1. Open the extension options:
   - Click the extension icon in your browser toolbar
   - Right-click and select "Options", or
   - Go to `chrome://extensions/`, find "EMR Copilot", and click "Details" → "Extension options"

2. Enter your Anthropic API key in the "AI API Key" field
3. The key will be stored securely in Chrome storage

or 

 open the assistence.js file and navigate to line 6. You will find the DEFAULT_API_KEY variable there. Replace it with your own key to use the application during development.
 

**Get an API Key:**
- Visit [Anthropic Console](https://console.anthropic.com/)
- Create an account and generate an API key
- The extension uses Claude 3 Haiku model by default

### 3. Enable Required Permissions

When you load the extension, Chrome will prompt you to grant these permissions:
- **Active Tab**: To access current OpenEMR pages
- **Scripting**: To inject the assistant panel
- **Storage**: To save your API key and settings
- **Side Panel**: To display the assistant interface

## How to Use

### Basic Usage

1. **Navigate to OpenEMR**
   - Open your OpenEMR instance in Chrome
   - Go to any patient encounter, demographics, or fee sheet page

2. **Open Assistant Panel**
   - Click the EMR Copilot extension icon in your browser toolbar
   - The side panel will slide in from the right side

3. **Start a Conversation**
   - Type commands in the chat interface
   - The assistant understands natural language



# EMR Copilot

An AI-powered clinical assistant for OpenEMR that integrates with Anthropic Claude to help generate SOAP notes, extract medical codes (ICD-10/CPT), and create fee slips for billing.

## Features

- **AI-Powered Clinical Documentation**: Draft SOAP notes automatically from patient data
- **Medical Code Extraction**: Automatically find and extract ICD-10, CPT, and SNOMED codes from clinical text
- **Fee Slip Generation**: Generate billing codes and charges for patient encounters
- **OpenEMR Integration**: Seamlessly insert generated content directly into OpenEMR forms
- **Side Panel Interface**: Chat-based assistant that opens alongside OpenEMR in your browser

## Architecture Overview

This Chrome extension consists of:

- **Manifest V3**: Modern Chrome extension with service worker
- **Side Panel UI**: Chat interface powered by Claude AI
- **Content Injection**: Injects assistant panel into OpenEMR webpages
- **AI Integration**: Uses Anthropic Claude 3 for content generation

### Files Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for extension lifecycle
├── content.js             # Injects side panel into web pages
├── sidepanel.html         # Main UI template
├── sidepanel.css          # Panel styling
├── assistant.js           # Core chat logic and AI integration
├── options.html           # Settings page
├── options.js             # Settings logic
└── popup.html/popup.js     # Legacy popup (not used)
```

