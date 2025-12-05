// Content script - Injects and manages the side panel
(function () {
    'use strict';

    let panelContainer = null;
    let isOpen = false;

    // Create and inject the side panel
    function createPanel() {
        if (panelContainer) return;

        // Create container
        panelContainer = document.createElement('div');
        panelContainer.id = 'soap-assistant-panel';

        // Create iframe to isolate styles
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';

        // Get the HTML file URL
        const panelURL = chrome.runtime.getURL('sidepanel.html');
        iframe.src = panelURL;

        panelContainer.appendChild(iframe);
        document.body.appendChild(panelContainer);

        // Wait for iframe to load, then set up communication
        iframe.onload = () => {
            // The assistant.js will handle all the logic inside the iframe
        };
    }

    // Toggle panel visibility
    function togglePanel() {
        if (!panelContainer) {
            createPanel();
        }

        isOpen = !isOpen;

        if (isOpen) {
            panelContainer.classList.add('open');
            adjustPageLayout(true);
        } else {
            panelContainer.classList.remove('open');
            adjustPageLayout(false);
        }
    }

    // Adjust the page layout using flex wrapper for sticky positioning
    function adjustPageLayout(shrink) {
        const wrapperId = 'soap-content-wrapper';
        const transitionDuration = '0.4s';
        const transitionEasing = 'cubic-bezier(0.25, 0.8, 0.25, 1)';

        if (shrink) {
            // Create wrapper if it doesn't exist
            let wrapper = document.getElementById(wrapperId);
            if (!wrapper) {
                // 1. Create a wrapper for all page content
                wrapper = document.createElement('div');
                wrapper.id = wrapperId;
                wrapper.style.flex = '1';
                wrapper.style.minWidth = '0'; // Allow flex shrinking
                wrapper.style.minHeight = '100vh'; // Ensure full height
                wrapper.style.height = '100%'; // Take full height
                wrapper.style.overflowX = 'auto'; // Allow horizontal scrolling if content is too wide
                wrapper.style.overflowY = 'auto'; // Allow vertical scrolling
                wrapper.style.position = 'relative';
                wrapper.style.display = 'flex'; // Make wrapper flex to preserve child layouts
                wrapper.style.flexDirection = 'column'; // Stack children vertically
                // Add smooth transition for width changes
                wrapper.style.transition = `flex ${transitionDuration} ${transitionEasing}, width ${transitionDuration} ${transitionEasing}`;

                // 2. Move all existing body content into the wrapper
                const children = Array.from(document.body.childNodes);
                children.forEach(child => {
                    // Skip the panel itself and script/style tags
                    if (child.id !== 'soap-assistant-panel' &&
                        child.tagName !== 'SCRIPT' &&
                        child.tagName !== 'STYLE') {
                        wrapper.appendChild(child);
                    }
                });

                // 3. Set up body as flex container
                // Save original body styles
                document.body.dataset.soapOriginalDisplay = document.body.style.display || '';
                document.body.dataset.soapOriginalFlexDirection = document.body.style.flexDirection || '';
                document.body.dataset.soapOriginalMargin = document.body.style.margin || '';
                document.body.dataset.soapOriginalPadding = document.body.style.padding || '';
                document.body.dataset.soapOriginalHeight = document.body.style.height || '';
                document.body.dataset.soapOriginalMinHeight = document.body.style.minHeight || '';
                document.body.dataset.soapOriginalTransition = document.body.style.transition || '';

                document.body.style.display = 'flex';
                document.body.style.flexDirection = 'row';
                document.body.style.margin = '0';
                document.body.style.padding = '0';
                document.body.style.minHeight = '100vh';
                document.body.style.height = 'auto';
                // Add smooth transition to body
                document.body.style.transition = `all ${transitionDuration} ${transitionEasing}`;

                // 4. Insert wrapper before the panel
                if (panelContainer) {
                    document.body.insertBefore(wrapper, panelContainer);
                } else {
                    document.body.appendChild(wrapper);
                }
            }
        } else {
            // Restore original layout
            setTimeout(() => {
                const wrapper = document.getElementById(wrapperId);
                if (!isOpen && wrapper) {
                    // Move content back to body
                    const children = Array.from(wrapper.childNodes);
                    children.forEach(child => {
                        document.body.insertBefore(child, wrapper);
                    });

                    // Remove wrapper
                    wrapper.remove();

                    // Restore body styles
                    document.body.style.display = document.body.dataset.soapOriginalDisplay;
                    document.body.style.flexDirection = document.body.dataset.soapOriginalFlexDirection;
                    document.body.style.margin = document.body.dataset.soapOriginalMargin;
                    document.body.style.padding = document.body.dataset.soapOriginalPadding;
                    document.body.style.height = document.body.dataset.soapOriginalHeight;
                    document.body.style.minHeight = document.body.dataset.soapOriginalMinHeight;
                    document.body.style.transition = document.body.dataset.soapOriginalTransition;

                    delete document.body.dataset.soapOriginalDisplay;
                    delete document.body.dataset.soapOriginalFlexDirection;
                    delete document.body.dataset.soapOriginalMargin;
                    delete document.body.dataset.soapOriginalPadding;
                    delete document.body.dataset.soapOriginalHeight;
                    delete document.body.dataset.soapOriginalMinHeight;
                    delete document.body.dataset.soapOriginalTransition;
                }
            }, 400); // Match animation duration
        }
    }

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleSidePanel') {
            togglePanel();
            sendResponse({ success: true });
        } else if (request.action === 'insertData') {
            const result = handleInsertion(request.data);
            sendResponse(result);
        }
    });

    // Handle data insertion into OpenEMR
    function handleInsertion(data) {
        try {
            let inserted = false;

            // Try to insert SOAP data
            if (data.soap) {
                const soapSuccess = insertSoapData(data.soap);
                if (soapSuccess) inserted = true;
            }

            // Try to insert Codes
            if (data.icdCodes || data.cptCodes) {
                const codesSuccess = insertCodesData(data.icdCodes, data.cptCodes);
                if (codesSuccess) inserted = true;
            }

            if (!inserted) {
                return { success: false, error: 'Could not find matching fields on this page' };
            }

            return { success: true };
        } catch (e) {
            console.error('Insertion error:', e);
            return { success: false, error: e.message };
        }
    }

    // Insert SOAP data into textareas
    function insertSoapData(soap) {
        let found = false;

        // Helper to find textarea by various means
        const findTextarea = (key) => {
            // 1. Try exact ID or name match
            let el = document.querySelector(`textarea[name*="${key}"], textarea[id*="${key}"]`);
            if (el) return el;

            // 2. Try finding by label
            const labels = Array.from(document.querySelectorAll('label, h2, h3, h4, div'));
            for (const label of labels) {
                if (label.innerText.toLowerCase().includes(key.toLowerCase())) {
                    // Look for textarea in next siblings or children
                    const textarea = label.querySelector('textarea') ||
                        label.parentElement.querySelector('textarea') ||
                        label.parentElement.nextElementSibling?.querySelector('textarea') ||
                        label.nextElementSibling;
                    if (textarea && textarea.tagName === 'TEXTAREA') return textarea;
                }
            }
            return null;
        };

        const fields = {
            'subjective': soap.subjective,
            'objective': soap.objective,
            'assessment': soap.assessment,
            'plan': soap.plan
        };

        for (const [key, value] of Object.entries(fields)) {
            if (!value) continue;

            const el = findTextarea(key);
            if (el) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                found = true;
            }
        }

        return found;
    }

    // Insert Codes into Fee Sheet - Direct table insertion
    function insertCodesData(icdCodes, cptCodes) {
        // Helper to find the "Selected Fee Sheet Codes and Charges for Current Encounter" table
        const findFeeSheetTable = () => {
            // First, look for the specific heading "Selected Fee Sheet Codes and Charges for Current Encounter"
            const allElements = Array.from(document.querySelectorAll('*'));

            for (const element of allElements) {
                const text = element.innerText || element.textContent || '';

                // Look for the exact section heading (not "Select Code")
                if (text.includes('Selected Fee Sheet Codes and Charges for Current Encounter')) {
                    // Found the heading, now find the table after it
                    let nextElement = element.nextElementSibling;

                    // Search through next siblings for a table
                    while (nextElement) {
                        if (nextElement.tagName === 'TABLE') {
                            return nextElement;
                        }
                        // Also check if table is nested inside the next element
                        const nestedTable = nextElement.querySelector('table');
                        if (nestedTable) {
                            return nestedTable;
                        }
                        nextElement = nextElement.nextElementSibling;
                    }

                    // If not found in siblings, check parent's next siblings
                    let parentNext = element.parentElement?.nextElementSibling;
                    while (parentNext) {
                        if (parentNext.tagName === 'TABLE') {
                            return parentNext;
                        }
                        const nestedTable = parentNext.querySelector('table');
                        if (nestedTable) {
                            return nestedTable;
                        }
                        parentNext = parentNext.nextElementSibling;
                    }
                }
            }

            // Fallback: Look for table with specific column headers (Type, Code, Description, Modifiers, Price, Qty, Justify)
            const tables = Array.from(document.querySelectorAll('table'));
            for (const table of tables) {
                const headerRow = table.querySelector('thead tr, tr:first-child');
                if (headerRow) {
                    const headerText = headerRow.innerText.toLowerCase();
                    // Make sure it has the right columns and is NOT the "Select Code" table
                    if (headerText.includes('type') &&
                        headerText.includes('code') &&
                        headerText.includes('description') &&
                        headerText.includes('modifiers') &&
                        !headerText.includes('new patient') &&
                        !headerText.includes('established patient')) {
                        return table;
                    }
                }
            }

            return null;
        };

        // Helper to create a table row for a code
        const createCodeRow = (codeData, codeType) => {
            const row = document.createElement('tr');

            // Determine the structure based on code type
            const isICD = codeType === 'ICD10';
            const code = codeData.code || codeData;
            const description = codeData.fullDescription || codeData.shortDescription || codeData.description || code;
            const price = codeData.price || (isICD ? '' : '0.00');

            // Match the exact OpenEMR table structure from the screenshot
            // Columns: Type | Code | Description | Modifiers | Price | Qty | Justify | Note Codes | Auth | Delete

            // Type cell (plain text, no input)
            const typeCell = document.createElement('td');
            typeCell.textContent = codeType;
            row.appendChild(typeCell);

            // Code cell (plain text, no input)
            const codeCell = document.createElement('td');
            codeCell.textContent = code;
            row.appendChild(codeCell);

            // Description cell (plain text, no input)
            const descCell = document.createElement('td');
            descCell.textContent = description;
            row.appendChild(descCell);

            // Modifiers cell (empty input)
            const modCell = document.createElement('td');
            modCell.innerHTML = '<input type="text" value="" />';
            row.appendChild(modCell);

            // Price cell (input with price)
            const priceCell = document.createElement('td');
            priceCell.innerHTML = `<input type="text" name="price[]" value="${price}" />`;
            row.appendChild(priceCell);

            // Qty cell (input - 1 for CPT, empty for ICD)
            const qtyCell = document.createElement('td');
            qtyCell.innerHTML = `<input type="text" name="qty[]" value="${isICD ? '' : '1'}" />`;
            row.appendChild(qtyCell);

            // Justify cell (dropdown/select - empty by default)
            const justifyCell = document.createElement('td');
            justifyCell.innerHTML = '<select name="justify[]"><option value=""></option></select>';
            row.appendChild(justifyCell);

            // Note Codes cell (empty input)
            const noteCodesCell = document.createElement('td');
            noteCodesCell.innerHTML = '<input type="text" value="" />';
            row.appendChild(noteCodesCell);

            // Auth cell (checkbox)
            const authCell = document.createElement('td');
            authCell.innerHTML = '<input type="checkbox" name="auth[]" />';
            row.appendChild(authCell);

            // Delete cell (checkbox)
            const deleteCell = document.createElement('td');
            deleteCell.innerHTML = '<input type="checkbox" name="delete[]" />';
            row.appendChild(deleteCell);

            return row;
        };

        // Helper to trigger recalculation of totals
        const recalculateTotals = () => {
            // Look for total calculation functions in the page
            if (typeof window.calc_total === 'function') {
                window.calc_total();
            }

            // Dispatch change events on fee inputs to trigger calculations
            const feeInputs = document.querySelectorAll('input[name="fee[]"]');
            feeInputs.forEach(input => {
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        };

        // Main insertion logic
        try {
            const table = findFeeSheetTable();
            if (!table) {
                console.error('Could not find Fee Sheet table');
                return false;
            }

            const tbody = table.querySelector('tbody') || table;

            // Find the header row (it contains "Type", "Code", "Description", etc.)
            let headerRow = null;
            const rows = tbody.querySelectorAll('tr');
            for (const row of rows) {
                const cellText = row.innerText.toLowerCase();
                if (cellText.includes('type') && cellText.includes('code') && cellText.includes('description')) {
                    headerRow = row;
                    break;
                }
            }

            let insertedCount = 0;

            // Insert ICD codes (after header row)
            if (icdCodes && icdCodes.length > 0) {
                for (const code of icdCodes) {
                    const row = createCodeRow(code, 'ICD10');
                    if (headerRow) {
                        // Insert after the header row
                        headerRow.parentNode.insertBefore(row, headerRow.nextSibling);
                    } else {
                        // Fallback: append to tbody
                        tbody.appendChild(row);
                    }
                    insertedCount++;
                }
            }

            // Insert CPT codes (after header row and ICD codes)
            if (cptCodes && cptCodes.length > 0) {
                for (const code of cptCodes) {
                    const row = createCodeRow(code, 'CPT4');
                    if (headerRow) {
                        // Insert after the header row
                        headerRow.parentNode.insertBefore(row, headerRow.nextSibling);
                    } else {
                        // Fallback: append to tbody
                        tbody.appendChild(row);
                    }
                    insertedCount++;
                }
            }

            // Trigger any recalculation functions
            if (insertedCount > 0) {
                setTimeout(() => recalculateTotals(), 100);
            }

            return insertedCount > 0;
        } catch (e) {
            console.error('Error inserting codes directly:', e);
            return false;
        }
    }

    // Listen for messages from the iframe (to close the panel)
    window.addEventListener('message', (event) => {
        // Verify the message is from our extension
        if (event.data && event.data.action === 'closePanel') {
            if (isOpen) {
                togglePanel();
            }
        }
    });

})();
