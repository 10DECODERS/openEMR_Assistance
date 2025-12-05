// Quick Test Script - Run this in the browser console on the Fee Sheet page
// This will tell you if the table can be detected

(function testFeeSheetDetection() {
    console.log('=== FEE SHEET TABLE DETECTION TEST ===');
    console.log('Current URL:', window.location.href);
    console.log('Page Title:', document.title);
    console.log('');

    // Test 1: Look for heading
    console.log('TEST 1: Looking for "Selected Fee Sheet Codes" heading...');
    const allElements = Array.from(document.querySelectorAll('*'));
    let foundHeading = false;

    for (const element of allElements) {
        const text = element.innerText || element.textContent || '';
        if (text.includes('Selected Fee Sheet Codes') || text.includes('Fee Sheet Codes and Charges')) {
            console.log('✓ FOUND HEADING:', element);
            console.log('  Text:', text.substring(0, 100));
            foundHeading = true;

            // Check for table after heading
            let nextElement = element.nextElementSibling;
            while (nextElement) {
                if (nextElement.tagName === 'TABLE') {
                    console.log('✓ FOUND TABLE AFTER HEADING:', nextElement);
                    break;
                }
                const nestedTable = nextElement.querySelector('table');
                if (nestedTable) {
                    console.log('✓ FOUND NESTED TABLE:', nestedTable);
                    break;
                }
                nextElement = nextElement.nextElementSibling;
            }
            break;
        }
    }

    if (!foundHeading) {
        console.log('✗ Heading not found');
    }
    console.log('');

    // Test 2: Look for tables with correct headers
    console.log('TEST 2: Checking all tables for correct headers...');
    const tables = Array.from(document.querySelectorAll('table'));
    console.log(`Found ${tables.length} tables on page`);
    console.log('');

    tables.forEach((table, i) => {
        console.log(`--- Table ${i + 1} ---`);
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (headerRow) {
            const headerText = headerRow.innerText;
            console.log('Headers:', headerText);

            const cells = Array.from(headerRow.querySelectorAll('th, td'));
            const cellTexts = cells.map(c => c.innerText.trim());
            console.log('Individual cells:', cellTexts);

            const hasType = headerText.toLowerCase().includes('type');
            const hasCode = headerText.toLowerCase().includes('code');
            const hasDescription = headerText.toLowerCase().includes('description');
            const hasPrice = headerText.toLowerCase().includes('price');

            console.log('Analysis:', {
                hasType,
                hasCode,
                hasDescription,
                hasPrice,
                isFeeSheetTable: hasType && hasCode && hasDescription
            });

            if (hasType && hasCode && hasDescription) {
                console.log('✓ THIS IS THE FEE SHEET TABLE!');
                console.log('Table element:', table);
            }
        } else {
            console.log('No header row found');
        }
        console.log('');
    });

    // Test 3: Check if we're in an iframe
    console.log('TEST 3: Frame detection...');
    if (window.self !== window.top) {
        console.log('⚠ WARNING: This is an IFRAME');
        console.log('Parent URL:', document.referrer);
    } else {
        console.log('ℹ This is the main window');
    }

    const iframes = document.querySelectorAll('iframe');
    console.log(`Found ${iframes.length} iframes in this page`);
    iframes.forEach((iframe, i) => {
        console.log(`  Iframe ${i + 1}: name="${iframe.name}", src="${iframe.src}"`);
    });

    console.log('');
    console.log('=== TEST COMPLETE ===');
    console.log('If the Fee Sheet table was found above, the extension should work.');
    console.log('If not, please share these results.');
})();
