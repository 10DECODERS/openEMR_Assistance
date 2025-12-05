// Page Inspector - Run this in the browser console to see what's available
// Copy and paste this entire code into the browser console when on an OpenEMR page

(function inspectPage() {
    console.log('=== OpenEMR Page Inspector ===');
    console.log('Current URL:', window.location.href);
    console.log('');

    // Check for textareas
    console.log('--- TEXTAREAS ---');
    const textareas = document.querySelectorAll('textarea');
    console.log(`Found ${textareas.length} textareas:`);
    textareas.forEach((ta, i) => {
        console.log(`  ${i + 1}. ID: "${ta.id}", Name: "${ta.name}", Placeholder: "${ta.placeholder}"`);
    });
    console.log('');

    // Check for tables
    console.log('--- TABLES ---');
    const tables = document.querySelectorAll('table');
    console.log(`Found ${tables.length} tables:`);
    tables.forEach((table, i) => {
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (headerRow) {
            const headers = Array.from(headerRow.querySelectorAll('th, td')).map(h => h.innerText.trim()).join(' | ');
            console.log(`  ${i + 1}. Headers: ${headers}`);
        } else {
            console.log(`  ${i + 1}. No headers found`);
        }
    });
    console.log('');

    // Check for links
    console.log('--- NAVIGATION LINKS ---');
    const links = Array.from(document.querySelectorAll('a'))
        .filter(a => a.innerText && a.innerText.trim().length > 0)
        .slice(0, 20); // Show first 20 links
    console.log(`Found ${links.length} links (showing first 20):`);
    links.forEach((link, i) => {
        console.log(`  ${i + 1}. "${link.innerText.trim()}" -> ${link.href}`);
    });
    console.log('');

    // Check for SOAP-related elements
    console.log('--- SOAP ELEMENTS ---');
    const soapKeywords = ['subjective', 'objective', 'assessment', 'plan'];
    soapKeywords.forEach(keyword => {
        const elements = document.querySelectorAll(`[name*="${keyword}" i], [id*="${keyword}" i]`);
        console.log(`  ${keyword}: ${elements.length} elements found`);
        elements.forEach(el => {
            console.log(`    - Tag: ${el.tagName}, ID: "${el.id}", Name: "${el.name}"`);
        });
    });
    console.log('');

    // Check for Fee Sheet elements
    console.log('--- FEE SHEET ELEMENTS ---');
    const feeSheetHeading = Array.from(document.querySelectorAll('*')).find(el =>
        el.innerText && el.innerText.includes('Selected Fee Sheet Codes')
    );
    if (feeSheetHeading) {
        console.log('  ✓ Found "Selected Fee Sheet Codes" heading');
        console.log('    Element:', feeSheetHeading);
    } else {
        console.log('  ✗ "Selected Fee Sheet Codes" heading not found');
    }

    const feeSheetTable = Array.from(document.querySelectorAll('table')).find(table => {
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (headerRow) {
            const headerText = headerRow.innerText.toLowerCase();
            return headerText.includes('type') &&
                headerText.includes('code') &&
                headerText.includes('description') &&
                headerText.includes('modifiers');
        }
        return false;
    });

    if (feeSheetTable) {
        console.log('  ✓ Found Fee Sheet table');
        console.log('    Table:', feeSheetTable);
    } else {
        console.log('  ✗ Fee Sheet table not found');
    }
    console.log('');

    // Check if we're in an iframe
    console.log('--- FRAME INFORMATION ---');
    if (window.self !== window.top) {
        console.log('  ⚠ This is an IFRAME');
        console.log('  Parent URL:', document.referrer);
    } else {
        console.log('  ℹ This is the main window (not an iframe)');
    }

    // Count iframes
    const iframes = document.querySelectorAll('iframe');
    console.log(`  Found ${iframes.length} iframes in this page`);
    iframes.forEach((iframe, i) => {
        console.log(`    ${i + 1}. Name: "${iframe.name}", Src: ${iframe.src}`);
    });

    console.log('');
    console.log('=== Inspection Complete ===');
    console.log('Copy these results and share them for debugging assistance.');
})();
