// Background service worker for EMR Assistant

// Set panel behavior and width
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Listen for extension icon clicks and set width
chrome.action.onClicked.addListener(async (tab) => {
    try {
        // Open the side panel
        await chrome.sidePanel.open({ windowId: tab.windowId });

        // Note: Chrome doesn't currently support setting side panel width via API
        // The width is controlled by the user dragging the panel edge
        // We can only suggest a width via CSS (which we've done)
        console.log('EMR Assistant side panel opened');
    } catch (error) {
        console.error('Error opening side panel:', error);
    }
});

console.log('EMR Assistant background service worker loaded');
