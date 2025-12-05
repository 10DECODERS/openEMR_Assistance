// Copilot Assistant Logic
(function () {
    'use strict';

    // DOM Elements
    const chatArea = document.getElementById('chatArea');
    const messagesContainer = document.getElementById('messagesContainer');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const closePanel = document.getElementById('closePanel');
    const newTopicBtn = document.getElementById('newTopicBtn');
    const suggestionCards = document.querySelectorAll('.suggestion-chip');

    // State
    let extractedContent = '';
    let lastGeneratedData = null;
    let currentMetadata = null;

    // Cache for generated codes (keyed by encounter ID + content hash)
    let generatedCodesCache = {};

    // --- Event Listeners ---

    // Close Panel
    if (closePanel) {
        closePanel.addEventListener('click', () => {
            window.parent.postMessage({ action: 'closePanel' }, '*');
        });
    }

    // New Topic
    if (newTopicBtn) {
        newTopicBtn.addEventListener('click', () => {
            messagesContainer.innerHTML = '';
            welcomeScreen.style.display = 'flex';
            extractedContent = '';
            lastGeneratedData = null;
            generatedCodesCache = {};  // Clear code cache for new conversation
        });
    }

    // Send Button
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const text = chatInput.value.trim();
            if (text) {
                handleUserMessage(text);
                chatInput.value = '';
                adjustTextareaHeight();
                sendBtn.disabled = true;
            }
        });
    }

    // Input Keypress (Enter to send)
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });

        // Input Typing (Enable/Disable send button)
        chatInput.addEventListener('input', () => {
            sendBtn.disabled = chatInput.value.trim().length === 0;
            adjustTextareaHeight();
        });
    }

    // Suggestion Chips
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.dataset.prompt;
            handleUserMessage(prompt);
        });
    });

    // Auto-resize textarea
    function adjustTextareaHeight() {
        if (!chatInput) return;
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    }

    // --- Chat Logic ---

    async function handleUserMessage(text) {
        // 1. Add User Message
        addMessage(text, 'user');
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        // 2. Show Loading
        showLoading(true);

        try {
            // CHECK: Is this OpenEMR?
            const isOpenEMR = await checkIsOpenEMR();
            if (!isOpenEMR) {
                addMessage("⚠️ I am designed to work only with **OpenEMR**. Please navigate to an OpenEMR page to use my features.", 'ai');
                showLoading(false);
                return;
            }

            // ALWAYS REFRESH CONTEXT: Get fresh content from the current page
            extractedContent = await getPageContent();

            if (!extractedContent || extractedContent.length < 50) {
                // If content is empty/too short, warn but try to proceed (maybe user just wants to chat)
                console.warn("Low content extracted");
            }

            // 3. Process Intent
            const lowerText = text.toLowerCase();

            if (lowerText.includes('draft soap') || (lowerText.includes('soap') && lowerText.includes('note'))) {
                await handleSoapGeneration();
            } else if (lowerText.includes('fee slip') || lowerText.includes('superbill')) {
                await handleFeeSlipGeneration();
            } else if (lowerText.includes('find codes') || (lowerText.includes('code') && lowerText.includes('extract'))) {
                await handleCodeExtraction();
            } else {
                // General Chat / Summaries / HPI / Questions
                await handleGeneralChat(text);
            }
        } catch (error) {
            console.error(error);
            addMessage("I encountered an error. Please ensure you are on an active OpenEMR page.", 'ai');
            showLoading(false);
        }
    }

    // ... (checkIsOpenEMR and addMessage functions remain unchanged) ...

    // --- Fee Slip Logic ---

    async function handleFeeSlipGeneration() {
        if (!extractedContent) {
            extractedContent = await getPageContent();
        }

        // Create a cache key based on encounter ID and chief complaint
        // This ensures consistency for the same encounter
        const cacheKey = `${currentMetadata?.encounter || 'unknown'}_${currentMetadata?.pid || 'unknown'}`;

        // Check if we already have codes for this encounter
        if (generatedCodesCache[cacheKey]) {
            console.log('Using cached billing codes for encounter:', cacheKey);
            const cachedData = generatedCodesCache[cacheKey];

            // Restore cached data
            lastGeneratedData = {
                icdCodes: cachedData.icdCodes,
                cptCodes: cachedData.cptCodes
            };

            // Display cached result
            const feeSlipHtml = `
                <div style="font-weight: 600; margin-bottom: 8px; color: #107c10;">Fee Slip for ${cachedData.patientName}</div>
                <div style="font-size: 11px; color: #666; margin-bottom: 8px;">ℹ️ Using previously generated codes for this encounter</div>

                <div class="code-block" style="font-size: 12px;">
                    <div style="margin-bottom: 8px;">
                        <strong>Diagnoses:</strong>
                        <ul style="margin: 4px 0 8px 16px; padding: 0;">
                            ${cachedData.diagnoses.map(d => `<li>${d}</li>`).join('')}
                        </ul>
                    </div>

                    <div style="margin-bottom: 8px;">
                        <strong>Services Rendered:</strong>
                        <ul style="margin: 4px 0 8px 16px; padding: 0;">
                            ${cachedData.services.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>

                    <div style="margin-bottom: 8px;">
                        <strong>Billing Codes:</strong><br>
                        ${cachedData.billing.icd.map(i => `• <strong>ICD-10 ${i.code}</strong>: ${i.desc}`).join('<br>')}
                        <br>
                        ${cachedData.billing.cpt.map(c => `• <strong>CPT ${c.code}</strong>: ${c.desc}`).join('<br>')}
                    </div>

                    <div style="border-top: 1px solid #d0d0d0; padding-top: 8px; margin-top: 8px;">
                        <strong>Charges:</strong><br>
                        ${cachedData.billing.cpt.map(c => `• Exam: $${c.price}`).join('<br>')}
                        <div style="margin-top: 4px; font-weight: 700;">Total: $${cachedData.total}</div>
                    </div>
                </div>
            ` + createResponseFooter('codes');

            addMessage(feeSlipHtml, 'ai');
            showLoading(false);
            return;
        }

        const apiKey = (await chrome.storage.sync.get({ apiKey: '' })).apiKey;
        if (!apiKey) {
            addMessage("Please set your Anthropic API key in the extension settings.", 'ai');
            showLoading(false);
            return;
        }

        const prompt = `You are an expert medical biller. Based on the clinical content below, generate a "Fee Slip" or Superbill.
        
        CRITICAL: You must be CONSISTENT. For the same patient encounter and symptoms, always return the SAME billing codes.
        
        EXTRACT:
        1. Patient Name
        2. Diagnoses (with ICD-10 codes - use the most specific codes based on the chief complaint)
        3. Services Rendered (with CPT codes - use standard E/M codes based on complexity)
        4. Estimated Charges (assign standard Medicare rates: Level 3 visit ~$100, Level 4 ~$150, etc.)
        
        RETURN JSON ONLY:
        {
            "patientName": "...",
            "diagnoses": ["Dx 1", "Dx 2"],
            "services": ["Service 1 (CPT)"],
            "billing": {
                "icd": [{"code": "...", "desc": "..."}],
                "cpt": [{"code": "...", "desc": "...", "price": 100}]
            },
            "total": 100
        }

        Clinical content:
        ${extractedContent.substring(0, 4000)}
        
        Output only the JSON:`;

        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 1024,
                    temperature: 0  // Set to 0 for maximum consistency
                })
            });

            const data = await resp.json();
            if (data.error) throw new Error(data.error.message);

            let jsonStr = data.content[0].text.trim();

            // Clean up if model adds markdown
            if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/```json\n?/, '').replace(/```$/, '');
            if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/```\n?/, '').replace(/```$/, '');

            let result;
            try {
                // First, try to parse as-is (the AI usually returns valid JSON)
                result = JSON.parse(jsonStr);
            } catch (parseError) {
                console.warn('Initial JSON parse failed for Fee Slip, attempting to sanitize...', parseError);

                // If that fails, try to fix common issues
                try {
                    // Remove any literal control characters (but keep already-escaped ones)
                    let sanitized = jsonStr;

                    // Only replace literal newlines/tabs that aren't already escaped
                    sanitized = sanitized.replace(/([^\\])\n/g, '$1\\n');
                    sanitized = sanitized.replace(/([^\\])\r/g, '$1\\n');
                    sanitized = sanitized.replace(/([^\\])\t/g, '$1\\t');

                    // Handle the case where the string starts with a control char
                    if (sanitized.startsWith('\n')) sanitized = '\\n' + sanitized.substring(1);
                    if (sanitized.startsWith('\r')) sanitized = '\\n' + sanitized.substring(1);
                    if (sanitized.startsWith('\t')) sanitized = '\\t' + sanitized.substring(1);

                    result = JSON.parse(sanitized);
                    console.log('Successfully parsed Fee Slip JSON after sanitization');
                } catch (secondError) {
                    console.error('Fee Slip JSON Parse Error (after sanitization):', secondError);
                    console.error('Original JSON:', jsonStr.substring(0, 500));
                    throw new Error('The AI returned invalid JSON for the fee slip. Please try again.');
                }
            }

            // Validate the response structure
            if (!result.billing || !result.billing.icd || !result.billing.cpt) {
                throw new Error('The AI response is missing required billing sections.');
            }

            // Store in cache for this encounter
            generatedCodesCache[cacheKey] = result;
            console.log('Cached billing codes for encounter:', cacheKey);

            // Store for insertion (reuse existing structure)
            lastGeneratedData = {
                icdCodes: result.billing.icd.map(i => ({ code: i.code, description: i.desc, codeType: 'ICD10' })),
                cptCodes: result.billing.cpt.map(c => ({ code: c.code, description: c.desc, price: c.price, codeType: 'CPT4' }))
            };

            // Generate Fee Sheet Link
            const feeSheetUrl = currentMetadata?.pid ?
                `/patient_file/encounter/load_form.php?formname=fee_sheet&pid=${currentMetadata.pid}&encounter=${currentMetadata.encounter || ''}` : null;

            const feeSlipHtml = `
                <div style="font-weight: 600; margin-bottom: 8px; color: #107c10;">Fee Slip for ${result.patientName}</div>
                
                <div class="code-block" style="font-size: 12px;">
                    <div style="margin-bottom: 8px;">
                        <strong>Diagnoses:</strong>
                        <ul style="margin: 4px 0 8px 16px; padding: 0;">
                            ${result.diagnoses.map(d => `<li>${d}</li>`).join('')}
                        </ul>
                    </div>

                    <div style="margin-bottom: 8px;">
                        <strong>Services Rendered:</strong>
                        <ul style="margin: 4px 0 8px 16px; padding: 0;">
                            ${result.services.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>

                    <div style="margin-bottom: 8px;">
                        <strong>Billing Codes:</strong><br>
                        ${result.billing.icd.map(i => `• <strong>ICD-10 ${i.code}</strong>: ${i.desc}`).join('<br>')}
                        <br>
                        ${result.billing.cpt.map(c => `• <strong>CPT ${c.code}</strong>: ${c.desc}`).join('<br>')}
                    </div>

                    <div style="border-top: 1px solid #d0d0d0; padding-top: 8px; margin-top: 8px;">
                        <strong>Charges:</strong><br>
                        ${result.billing.cpt.map(c => `• Exam: $${c.price}`).join('<br>')}
                        <div style="margin-top: 4px; font-weight: 700;">Total: $${result.total}</div>
                    </div>
                </div>
            ` + createResponseFooter('codes');

            addMessage(feeSlipHtml, 'ai');

        } catch (e) {
            console.error('Fee Slip Generation Error:', e);
            const errorMsg = e.message || 'Unknown error occurred';
            addMessage(`❌ I had trouble generating the fee slip: ${errorMsg}`, 'ai');
        } finally {
            showLoading(false);
        }
    }

    // Check if current tab is OpenEMR
    async function checkIsOpenEMR() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                console.warn("No active tab found");
                return false;
            }

            const url = tab.url ? tab.url.toLowerCase() : '';
            const title = tab.title ? tab.title.toLowerCase() : '';

            console.log("Checking OpenEMR - URL:", url, "Title:", title);

            // Checks for common OpenEMR indicators
            const isOpenEMR = title.includes('openemr') ||
                url.includes('/interface/') ||
                url.includes('/openemr') ||
                url.includes('demo.openemr') ||
                url.includes('/patient_file/') ||
                url.includes('/encounter/') ||
                url.includes('fee_sheet') ||
                url.includes('/main/tabs/');

            console.log("Is OpenEMR:", isOpenEMR);
            return isOpenEMR;
        } catch (e) {
            console.error("Error checking OpenEMR:", e);
            // If we can't check, assume it might be OpenEMR and let the content extraction fail gracefully
            return true;
        }
    }

    function addMessage(content, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;

        if (type === 'ai') {
            msgDiv.innerHTML = `
                <div class="ai-avatar">
                    <img src="icon48.png" alt="EMR Copilot" width="24" height="24" style="display: block;">
                </div>
                <div class="message-content">${content}</div>
            `;
        } else {
            msgDiv.innerHTML = `<div class="message-content">${escapeHtml(content)}</div>`;
        }

        messagesContainer.appendChild(msgDiv);

        // Scroll to bottom
        if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;

        // Bind events for any buttons in the message
        const insertBtns = msgDiv.querySelectorAll('.insert-action-btn');
        insertBtns.forEach(btn => {
            btn.addEventListener('click', (event) => insertIntoOpenEMR(event));
        });

        const copyBtns = msgDiv.querySelectorAll('.copy-action-btn');
        copyBtns.forEach(btn => {
            btn.addEventListener('click', (event) => copyToClipboard(event));
        });

        const followUpBtns = msgDiv.querySelectorAll('.follow-up-suggestion, .suggestion-item');
        followUpBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                handleUserMessage(prompt);
            });
        });

        // Bind navigation buttons
        const navBtns = msgDiv.querySelectorAll('.nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                if (url) {
                    chrome.tabs.update({ url: new URL(url, currentMetadata?.url || 'http://localhost').href });
                }
            });
        });

        // Bind sources toggle
        const sourcesToggle = msgDiv.querySelector('.sources-toggle');
        if (sourcesToggle) {
            sourcesToggle.addEventListener('click', () => {
                sourcesToggle.classList.toggle('expanded');
                const sourcesContent = sourcesToggle.nextElementSibling;
                if (sourcesContent) {
                    sourcesContent.classList.toggle('visible');
                }
                const svg = sourcesToggle.querySelector('svg');
                if (svg) {
                    svg.style.transform = sourcesToggle.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            });
        }

        // Bind source links
        const sourceLinks = msgDiv.querySelectorAll('.source-link');
        sourceLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = link.dataset.url;
                if (url) {
                    chrome.tabs.update({ url: url });
                }
            });
        });

        // Bind feedback buttons
        const feedbackBtns = msgDiv.querySelectorAll('.feedback-btn');
        feedbackBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const isActive = btn.classList.contains('active');
                const parentDiv = btn.closest('.feedback-buttons');
                if (parentDiv) {
                    parentDiv.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('active'));
                }
                if (!isActive) {
                    btn.classList.add('active');
                    const isLike = btn.classList.contains('feedback-like');
                    console.log(`User ${isLike ? 'liked' : 'disliked'} this response`);
                }
            });
        });

        // Bind more options button
        const moreOptionsBtn = msgDiv.querySelector('.more-options-btn');
        if (moreOptionsBtn) {
            moreOptionsBtn.addEventListener('click', () => {
                alert('More options coming soon!');
            });
        }
    }

    function showLoading(show) {
        if (loadingIndicator) {
            loadingIndicator.style.display = show ? 'flex' : 'none';
            if (show && chatArea) chatArea.scrollTop = chatArea.scrollHeight;
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Toast notification system
    function showToast(message, type = 'info') {
        // Remove any existing toast
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast-notification';

        const colors = {
            success: { bg: '#2e7d32', border: '#1b5e20' },
            warning: { bg: '#f57c00', border: '#e65100' },
            error: { bg: '#c62828', border: '#b71c1c' },
            info: { bg: '#1976d2', border: '#0d47a1' }
        };

        const color = colors[type] || colors.info;

        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${color.bg};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            border-left: 4px solid ${color.border};
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;

        toast.textContent = message;
        document.body.appendChild(toast);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }


    // --- Core Functions ---

    async function getPageContent() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab");

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: pageExtractor
        });

        const agg = aggregateResults(results.map(r => r.result).filter(Boolean));
        currentMetadata = agg.metadata; // Store metadata globally
        return agg.text;
    }

    function pageExtractor() {
        try {
            let extractedData = {
                pageType: '',
                patientInfo: {},
                clinicalData: {},
                rawText: ''
            };

            // Detect page type
            const pageTitle = document.title.toLowerCase();
            const url = window.location.href.toLowerCase();

            if (url.includes('fee_sheet') || pageTitle.includes('fee sheet')) {
                extractedData.pageType = 'Fee Sheet';
            } else if (url.includes('encounter') || pageTitle.includes('encounter')) {
                extractedData.pageType = 'Encounter';
            } else if (url.includes('patient_file') || url.includes('demographics')) {
                extractedData.pageType = 'Patient Chart';
            } else if (url.includes('dashboard')) {
                extractedData.pageType = 'Dashboard';
            }

            // Extract patient demographics
            const patientName = document.querySelector('[class*="patient"]')?.innerText || '';
            const demographics = document.querySelector('[class*="demographic"]')?.innerText || '';
            extractedData.patientInfo = { name: patientName, demographics };

            // Extract vitals
            const vitalsSection = document.querySelector('[id*="vital"], [class*="vital"]');
            if (vitalsSection) {
                extractedData.clinicalData.vitals = vitalsSection.innerText;
            }

            // Extract medications
            const medsSection = document.querySelector('[id*="medication"], [class*="medication"]');
            if (medsSection) {
                extractedData.clinicalData.medications = medsSection.innerText;
            }

            // Extract allergies
            const allergySection = document.querySelector('[id*="allerg"], [class*="allerg"]');
            if (allergySection) {
                extractedData.clinicalData.allergies = allergySection.innerText;
            }

            // Extract problem list
            const problemSection = document.querySelector('[id*="problem"], [class*="problem"]');
            if (problemSection) {
                extractedData.clinicalData.problems = problemSection.innerText;
            }

            // Extract all textareas (SOAP notes, etc.)
            const textareas = document.querySelectorAll('textarea');
            let soapNotes = '';
            textareas.forEach(ta => {
                if (ta.value && ta.value.length > 10) {
                    soapNotes += ta.value + '\n';
                }
            });
            if (soapNotes) {
                extractedData.clinicalData.notes = soapNotes;
            }

            // Extract Chief Complaint / Reason For Visit (CRITICAL for SOAP notes)
            // Look for common patterns in OpenEMR
            let chiefComplaint = '';

            // Method 1: Look for "Reason For Visit" label and nearby text
            const reasonLabels = Array.from(document.querySelectorAll('*')).filter(el => {
                const text = el.textContent?.trim().toLowerCase() || '';
                return text === 'reason for visit' || text === 'chief complaint' || text === 'reason for visit:';
            });

            for (const label of reasonLabels) {
                // Try to find the value in the next sibling or parent's next sibling
                let valueElement = label.nextElementSibling;
                if (!valueElement && label.parentElement) {
                    valueElement = label.parentElement.nextElementSibling;
                }
                if (valueElement) {
                    const text = valueElement.textContent?.trim() || '';
                    if (text && text.length > 5 && text.length < 500) {
                        chiefComplaint = text;
                        break;
                    }
                }
            }

            // Method 2: Look for input/textarea with name or id containing 'reason' or 'chief'
            if (!chiefComplaint) {
                const ccInputs = document.querySelectorAll('input[name*="reason"], input[id*="reason"], textarea[name*="reason"], textarea[id*="reason"], input[name*="chief"], textarea[name*="chief"]');
                for (const input of ccInputs) {
                    const value = input.value?.trim() || '';
                    if (value && value.length > 5) {
                        chiefComplaint = value;
                        break;
                    }
                }
            }

            // Method 3: Search in the raw text for "Reason For Visit:" pattern
            if (!chiefComplaint) {
                const bodyText = document.body.innerText || '';
                const reasonMatch = bodyText.match(/Reason For Visit[:\s]*([^\n]+)/i);
                if (reasonMatch && reasonMatch[1]) {
                    chiefComplaint = reasonMatch[1].trim();
                }
            }

            if (chiefComplaint) {
                extractedData.clinicalData.chiefComplaint = chiefComplaint;
            }

            // Extract all tables (often contain codes, vitals, etc.)
            const tables = document.querySelectorAll('table');
            let tableData = '';
            tables.forEach(table => {
                const text = table.innerText;
                if (text && text.length > 20 && text.length < 5000) {
                    tableData += text + '\n';
                }
            });
            if (tableData) {
                extractedData.clinicalData.tableData = tableData;
            }

            // Get all visible text as fallback
            extractedData.rawText = document.body.innerText || '';

            // Combine everything into a structured string
            let fullText = `PAGE TYPE: ${extractedData.pageType} \n\n`;

            if (extractedData.patientInfo.name) {
                fullText += `PATIENT: ${extractedData.patientInfo.name} \n`;
            }
            if (extractedData.patientInfo.demographics) {
                fullText += `DEMOGRAPHICS: ${extractedData.patientInfo.demographics} \n\n`;
            }

            // CRITICAL: Add Chief Complaint/Reason For Visit at the top
            if (extractedData.clinicalData.chiefComplaint) {
                fullText += `⚠️ CHIEF COMPLAINT / REASON FOR VISIT: \n${extractedData.clinicalData.chiefComplaint} \n\n`;
            }

            if (extractedData.clinicalData.vitals) {
                fullText += `VITALS: \n${extractedData.clinicalData.vitals} \n\n`;
            }
            if (extractedData.clinicalData.medications) {
                fullText += `MEDICATIONS: \n${extractedData.clinicalData.medications} \n\n`;
            }
            if (extractedData.clinicalData.allergies) {
                fullText += `ALLERGIES: \n${extractedData.clinicalData.allergies} \n\n`;
            }
            if (extractedData.clinicalData.problems) {
                fullText += `PROBLEMS: \n${extractedData.clinicalData.problems} \n\n`;
            }
            if (extractedData.clinicalData.notes) {
                fullText += `CLINICAL NOTES: \n${extractedData.clinicalData.notes} \n\n`;
            }
            if (extractedData.clinicalData.tableData) {
                fullText += `TABLE DATA: \n${extractedData.clinicalData.tableData} \n\n`;
            }

            // Add raw text as fallback
            fullText += `\nRAW PAGE CONTENT: \n${extractedData.rawText.substring(0, 10000)} `;

            // Extract IDs for navigation
            const urlParams = new URLSearchParams(window.location.search);
            let pid = urlParams.get('pid');
            let encounter = urlParams.get('encounter');

            // Fallback: Try to find IDs in frames or inputs if not in main URL
            if (!pid) {
                const pidInput = document.querySelector('input[name="pid"], input[name="patient_id"]');
                if (pidInput) pid = pidInput.value;
            }

            return {
                text: fullText.substring(0, 20000),
                metadata: { pid, encounter, url: window.location.href }
            };
        } catch (e) {
            console.error('Extraction error:', e);
            return { text: document.body?.innerText?.substring(0, 16000) || '' };
        }
    }

    function aggregateResults(results) {
        return { text: results.map(r => r.text).join('\n\n--- FRAME BOUNDARY ---\n\n') };
    }

    async function handleGeneralChat(userQuery) {
        // Content is already freshly fetched in handleUserMessage
        const apiKey = (await chrome.storage.sync.get({ apiKey: '' })).apiKey;
        if (!apiKey) {
            addMessage("Please set your Anthropic API key in the extension settings.", 'ai');
            showLoading(false);
            return;
        }
        // Construct Prompt with fresh patient context
        const systemPrompt = `You are "EMR Copilot", an expert clinical AI assistant deeply integrated into OpenEMR.
        
        YOUR ROLE:
        - You are a real-time clinical partner for the user.
        - You have deep knowledge of OpenEMR's interface, workflows, and data structures.
        - You are an expert in clinical documentation, medical coding (ICD-10/CPT), and patient data analysis.

        OPENEMR KNOWLEDGE BASE:
        - **Fee Sheet**: Used for billing. You can insert ICD-10 and CPT codes here.
        - **SOAP Note**: Standard documentation format. You can draft and insert notes here.
        - **Demographics**: Patient details. You can read this to personalize responses.
        - **Vitals/Encounters**: Clinical data points you can analyze for trends.
        
        CAPABILITIES:
        1. **Answer Medical Questions**: Analyze the current page content to answer questions about the patient's history, meds, allergies, etc.
        2. **Draft Documentation**: Create SOAP notes, referral letters, or summaries.
        3. **Coding Assistance**: Suggest appropriate billing codes based on the clinical text.
        4. **Navigation Guide**: If you can't perform an action directly, guide the user on where to click in OpenEMR.

        CRITICAL INSTRUCTIONS FOR RESPONSES:
        - **BE CONCISE**: Clinicians are busy. Use bullet points and short sentences.
        - **USE BOLDING**: Highlight **key findings**, **abnormal values**, **medications**, and **diagnoses**.
        - **CONTEXT AWARE**: Always reference the "CURRENT OPENEMR PAGE CONTENT" provided below. If the answer isn't there, say "I don't see that information on this page."
        - **ACTION ORIENTED**: If the user asks for a note or codes, offer to generate them.

        RESPONSE FORMAT:
        - **Direct Answer**: Start with the answer to the user's question.
        - **Clinical Context**: Support your answer with data from the page (e.g., "BP is **150/90** as noted in Vitals").
        - **Next Steps**: Suggest relevant actions (e.g., "Would you like me to draft a SOAP note for this hypertension visit?").

        EXAMPLE INTERACTION:
        User: "What is this patient's history?"
        You: "**John Doe** (52M) has a history of **Type 2 Diabetes** and **Hypertension**.
        • **Current Meds**: Metformin 500mg, Lisinopril 10mg.
        • **Recent Vitals**: BP **145/85**, HR 78.
        • **Allergies**: Penicillin.
        
        Would you like me to draft a visit note or find codes for these conditions?"`;


        // Detect if user is asking for summary/history
        const isSummaryRequest = /\b(summary|summarize|history|overview|review)\b/i.test(userQuery);

        const userPrompt = `CURRENT OPENEMR PAGE CONTENT:
${extractedContent || "No content extracted from page."}

USER QUESTION: "${userQuery}"

${isSummaryRequest ? `
⚠️ IMPORTANT: The user is asking for a SUMMARY or HISTORY. You MUST:
1. Extract ONLY medically relevant information from the page content
2. Ignore all UI elements, menus, headers, footers, and administrative text
3. Present a concise, organized clinical summary with clear sections
4. Do NOT return the entire dataset - filter and condense to key clinical points
5. Focus on: Demographics, Chief Complaint, Vitals, Medications, Allergies, Problem List, and Recent Notes
` : ''}

YOUR RESPONSE: `;

        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [
                        { role: 'user', content: systemPrompt + "\n\n" + userPrompt }
                    ],
                    max_tokens: 1024
                })
            });

            const data = await resp.json();
            if (data.error) throw new Error(data.error.message);

            let aiResponse = data.content[0].text.trim();

            // Convert markdown bold (**text**) to HTML strong tags
            aiResponse = aiResponse.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            // Convert newlines to breaks for display
            const formattedResponse = aiResponse.replace(/\n/g, '<br>');

            // Add footer with suggestions, navigation, and context
            const footer = createResponseFooter(isSummaryRequest ? 'summary' : 'general');
            addMessage(formattedResponse + footer, 'ai');

        } catch (e) {
            console.error(e);
            addMessage("I'm having trouble connecting to the AI. Please check your internet or API key.", 'ai');
        } finally {
            showLoading(false);
        }
    }


    async function handleSoapGeneration() {
        // Content is already freshly fetched in handleUserMessage
        if (!extractedContent) {
            addMessage("I couldn't find any clinical content on this page to analyze.", 'ai');
            showLoading(false);
            return;
        }

        // 2. Call LLM (Simulated or Real)
        const apiKey = (await chrome.storage.sync.get({ apiKey: '' })).apiKey;
        if (!apiKey) {
            addMessage("Please set your Anthropic API key in the extension settings.", 'ai');
            showLoading(false);
            return;
        }

        const prompt = `You are an expert clinical scribe. Generate a SOAP note from the clinical data below.

        REQUIREMENTS:
        - **SUBJECTIVE**: Patient's chief complaint and symptoms (be specific)
        - **OBJECTIVE**: Vital signs and exam findings  
        - **ASSESSMENT**: Clinical impression and diagnoses
        - **PLAN**: Treatment, medications, follow-up

        Keep each section under 100 words. Be concise but complete.
        
        Return ONLY this JSON format (no markdown, no extra text):
        {
            "soap_content": {
                "subjective": "...",
                "objective": "...",
                "assessment": "...",
                "plan": "..."
            }
        }

        Clinical data:
        ${extractedContent.substring(0, 2500)}
        
        JSON output:`;

        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 4096  // Increased from 2048 to prevent truncation
                })
            });

            const data = await resp.json();
            if (data.error) throw new Error(data.error.message);

            let jsonStr = data.content[0].text.trim();

            // Log the stop reason for debugging
            console.log('[SOAP] Stop reason:', data.stop_reason);
            console.log('[SOAP] Response length:', jsonStr.length);

            // Check if response was truncated
            if (data.stop_reason === 'max_tokens') {
                console.error('AI response hit max_tokens limit');
                throw new Error('The SOAP note was too long and got cut off. Try reducing the encounter details or generate a shorter note.');
            }

            // Clean up if model adds markdown
            if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/```json\n?/, '').replace(/```$/, '');
            if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/```\n?/, '').replace(/```$/, '');

            // Multiple truncation checks

            // Check 1: Does JSON end properly?
            if (!jsonStr.trim().endsWith('}')) {
                console.error('JSON does not end with closing brace');
                console.error('Last 100 chars:', jsonStr.slice(-100));
                throw new Error('The AI response was incomplete (no closing brace). Please try again.');
            }

            // Check 2: Count braces
            const openBraces = (jsonStr.match(/{/g) || []).length;
            const closeBraces = (jsonStr.match(/}/g) || []).length;
            if (openBraces !== closeBraces) {
                console.error('Mismatched braces:', `${openBraces} open, ${closeBraces} close`);
                console.error('Truncated JSON:', jsonStr.substring(0, 500));
                console.error('End of JSON:', jsonStr.slice(-200));
                throw new Error(`The AI response has mismatched braces (${openBraces} open, ${closeBraces} close). Please try again.`);
            }

            // Check 3: Look for incomplete strings (ends with quote but no closing quote)
            // This catches cases like: "assessment": "The patient is in stable condition
            const lastQuoteIndex = jsonStr.lastIndexOf('"');
            const lastBraceIndex = jsonStr.lastIndexOf('}');
            if (lastQuoteIndex > lastBraceIndex) {
                console.error('JSON appears to have unclosed string');
                console.error('Last 200 chars:', jsonStr.slice(-200));
                throw new Error('The AI response has an unclosed string. Please try again.');
            }

            let result;
            try {
                // First, try to parse as-is (the AI usually returns valid JSON)
                result = JSON.parse(jsonStr);
            } catch (parseError) {
                console.warn('Initial JSON parse failed, attempting to sanitize...', parseError);

                // If that fails, try to fix common issues
                // This is a fallback - only sanitize if parsing fails
                try {
                    // Remove any literal control characters (but keep already-escaped ones)
                    let sanitized = jsonStr;

                    // Only replace literal newlines/tabs that aren't already escaped
                    // This regex looks for control chars NOT preceded by backslash
                    sanitized = sanitized.replace(/([^\\])\n/g, '$1\\n');
                    sanitized = sanitized.replace(/([^\\])\r/g, '$1\\n');
                    sanitized = sanitized.replace(/([^\\])\t/g, '$1\\t');

                    // Handle the case where the string starts with a control char
                    if (sanitized.startsWith('\n')) sanitized = '\\n' + sanitized.substring(1);
                    if (sanitized.startsWith('\r')) sanitized = '\\n' + sanitized.substring(1);
                    if (sanitized.startsWith('\t')) sanitized = '\\t' + sanitized.substring(1);

                    result = JSON.parse(sanitized);
                    console.log('Successfully parsed after sanitization');
                } catch (secondError) {
                    console.error('JSON Parse Error (after sanitization):', secondError);
                    console.error('Original JSON:', jsonStr.substring(0, 500));
                    throw new Error('The AI returned invalid JSON. Please try generating the note again.');
                }
            }

            // Validate the response structure
            if (!result.soap_content || !result.soap_content.subjective) {
                throw new Error('The AI response is missing required SOAP sections.');
            }

            // Store for insertion (only SOAP, no codes)
            lastGeneratedData = {
                soap: result.soap_content
            };

            // 3. Render Result - use escapeHtml to prevent XSS
            const soapHtml = `
                <div style="margin-bottom: 12px;">Here is the drafted SOAP note based on the patient's records:</div>
                <div class="code-block">
                    <strong>S:</strong> ${escapeHtml(result.soap_content.subjective).replace(/\n/g, '<br>')}<br><br>
                    <strong>O:</strong> ${escapeHtml(result.soap_content.objective).replace(/\n/g, '<br>')}<br><br>
                    <strong>A:</strong> ${escapeHtml(result.soap_content.assessment).replace(/\n/g, '<br>')}<br><br>
                    <strong>P:</strong> ${escapeHtml(result.soap_content.plan).replace(/\n/g, '<br>')}
                </div>
            ` + createResponseFooter('soap');

            addMessage(soapHtml, 'ai');

        } catch (e) {
            console.error('SOAP Generation Error:', e);
            const errorMsg = e.message || 'Unknown error occurred';
            addMessage(`❌ I had trouble generating the note: ${errorMsg}`, 'ai');
        } finally {
            showLoading(false);
        }
    }

    async function handleCodeExtraction() {
        if (!extractedContent) {
            extractedContent = await getPageContent();
        }

        // Simple extraction logic (can be enhanced with LLM)
        const icdRegex = /\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b/g;
        const cptRegex = /\b\d{5}\b/g;

        const icd = [...new Set(extractedContent.match(icdRegex) || [])];
        const cpt = [...new Set(extractedContent.match(cptRegex) || [])];

        if (icd.length === 0 && cpt.length === 0) {
            addMessage("I couldn't find any specific ICD-10 or CPT codes in the text.", 'ai');
        } else {
            const html = `
                Found the following codes in the text:
                <div class="code-block">
                    <strong>ICD-10:</strong> ${icd.join(', ') || 'None'}<br>
                    <strong>CPT:</strong> ${cpt.join(', ') || 'None'}
                </div>
                Would you like me to generate a full note with these?
            ` + createResponseFooter('codes');
            addMessage(html, 'ai');
        }
        showLoading(false);
    }

    async function handleSummary() {
        if (!extractedContent) {
            extractedContent = await getPageContent();
        }
        // Placeholder for summary logic
        addMessage(`I've analyzed ${extractedContent.length} characters of patient data. I can summarize this into a brief history or HPI. Just ask!`, 'ai');
        showLoading(false);
    }

    // --- Helper Functions ---

    function getBaseUrl() {
        try {
            const url = new URL(window.location.href);
            return url.origin + url.pathname.split('/interface/')[0] + '/interface';
        } catch (e) {
            return '';
        }
    }

    function generateNavigationLinks(metadata) {
        if (!metadata || !metadata.pid) return '';

        const links = [];
        const baseUrl = metadata.baseUrl || '';

        // Common OpenEMR paths
        // Note: These paths might vary based on OpenEMR version/setup, but these are standard
        const paths = {
            'soap': `/patient_file/encounter/load_form.php?formname=soap&pid=${metadata.pid}&encounter=${metadata.encounter || ''}`,
            'feesheet': `/patient_file/encounter/load_form.php?formname=fee_sheet&pid=${metadata.pid}&encounter=${metadata.encounter || ''}`,
            'vitals': `/patient_file/encounter/load_form.php?formname=vitals&pid=${metadata.pid}&encounter=${metadata.encounter || ''}`,
            'demographics': `/patient_file/summary/demographics.php?pid=${metadata.pid}`
        };

        // Create HTML for links
        return `
            <div class="navigation-links" style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="nav-btn" data-url="${paths.soap}" title="Go to SOAP Note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    SOAP
                </button>
                <button class="nav-btn" data-url="${paths.feesheet}" title="Go to Fee Sheet">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    Fee Sheet
                </button>
                <button class="nav-btn" data-url="${paths.demographics}" title="Go to Demographics">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Patient
                </button>
            </div>
        `;
    }

    function aggregateResults(results) {
        // Combine text and merge metadata
        const text = results.map(r => r.text).join('\n');
        const metadata = results.reduce((acc, r) => ({ ...acc, ...r.metadata }), {});
        return { text, metadata };
    }

    // --- Response Helpers ---

    function createResponseFooter(intent) {
        // Determine context type
        const contextType = currentMetadata?.url?.includes('fee_sheet') ? 'Fee Sheet' :
            currentMetadata?.url?.includes('encounter') ? 'Encounter' :
                currentMetadata?.url?.includes('demographics') ? 'Patient Chart' : 'OpenEMR';

        // Get the source page URL safely
        const sourceUrl = currentMetadata?.url || '';
        let displayUrl = '';
        try {
            if (sourceUrl) {
                displayUrl = new URL(sourceUrl).pathname;
            }
        } catch (e) {
            displayUrl = sourceUrl; // Fallback to full URL if parsing fails
        }

        // Collapsible Sources Section (for all responses)
        const sourcesHtml = `
            <div class="sources-section">
                <button class="sources-toggle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    <span>Sources (1)</span>
                </button>
                <div class="sources-content">
                    ${sourceUrl ? `
                        <a href="#" class="source-link" data-url="${sourceUrl}" style="
                            color: #1a73e8;
                            text-decoration: none;
                            font-size: 12px;
                            display: inline-flex;
                            align-items: center;
                            gap: 6px;
                            word-break: break-all;
                        ">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            ${displayUrl}
                        </a>
                    ` : '<div style="font-size: 12px; color: #5f6368;">No source available</div>'}
                    ${currentMetadata?.pid ? `
                        <div style="margin-top: 8px; font-size: 11px; color: #5f6368;">
                            Patient ID: ${currentMetadata.pid}${currentMetadata?.encounter ? ` • Encounter: ${currentMetadata.encounter}` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Only show action buttons for SOAP and Fee Slip
        const showActionButtons = intent === 'soap' || intent === 'codes';

        let actionButtonsHtml = '';

        // Action Buttons Row - Only for SOAP and Fee Slip
        if (showActionButtons) {
            const showInsert = intent === 'soap' || intent === 'codes';

            actionButtonsHtml = `
                <div class="action-buttons-row">
                    ${showInsert ? `
                        <button class="action-btn insert-action-btn" data-action="insert">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            </svg>
                            Insert
                        </button>
                    ` : ''}
                    <button class="action-btn copy-action-btn" data-action="copy">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Copy
                    </button>
                    <button class="more-options-btn" title="More options">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                    </button>
                    <div class="feedback-buttons">
                        <button class="feedback-btn feedback-like" title="Good response">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                            </svg>
                        </button>
                        <button class="feedback-btn feedback-dislike" title="Bad response">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }

        // Follow-up Suggestions (for all responses)
        let suggestions = [];
        if (intent === 'summary') {
            suggestions = [
                'Draft a SOAP note',
                'Find billing codes',
                'What are the current vital signs?'
            ];
        } else if (intent === 'soap') {
            suggestions = [
                'Generate billing codes for this visit',
                'Summarize patient history',
                'What are the current medications?'
            ];
        } else if (intent === 'codes') {
            suggestions = [
                'Draft a SOAP note',
                'Summarize patient history',
                'What are the current vital signs?'
            ];
        } else {
            suggestions = [
                'Draft a SOAP note',
                'Find billing codes',
                'Summarize patient history'
            ];
        }

        const suggestionsHtml = `
            <div class="suggestions-container">
                <div class="suggestions-list">
                    ${suggestions.map(text => `
                        <button class="suggestion-item" data-prompt="${text}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 10 4 15 9 20"></polyline>
                                <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
                            </svg>
                            <span>${text}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        return sourcesHtml + actionButtonsHtml + suggestionsHtml;
    }

    // --- Insertion Logic ---

    async function insertIntoOpenEMR(event) {
        if (!lastGeneratedData) {
            alert("No data to insert! Please generate a note first.");
            return;
        }

        // Get the button that was clicked
        const btn = event ? event.target.closest('.insert-action-btn') : document.querySelector('.insert-action-btn');
        const originalText = btn ? btn.innerHTML : 'Insert into OpenEMR';

        if (btn) {
            btn.innerHTML = `
                <svg class="spinner" viewBox="0 0 50 50" style="width:16px;height:16px;animation:spin 1s linear infinite;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                Inserting...
            `;
            btn.disabled = true;
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Execute insertion worker
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: insertionWorker,
                args: [lastGeneratedData, false]
            });

            const success = results.some(r => r.result && r.result.success);

            if (success) {
                // Show success inline - update button to show success state
                if (btn) {
                    btn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                         Inserted
                    `;
                    btn.style.backgroundColor = '#2e7d32';
                    btn.style.borderColor = '#2e7d32';
                    btn.style.color = 'white';

                    // Reset after 3 seconds
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.style.backgroundColor = '';
                        btn.style.borderColor = '';
                        btn.style.color = '';
                        btn.disabled = false;
                    }, 3000);
                }

                // Show a toast notification instead of a new message
                showToast("✅ Successfully inserted into OpenEMR", "success");
            } else {
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
                showToast("⚠️ Couldn't find the right fields. Please ensure you're on the Fee Sheet or SOAP page.", "warning");
            }
        } catch (error) {
            console.error(error);
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            showToast("❌ Error inserting data: " + error.message, "error");
        }
    }

    // Worker function to run inside the page (in all frames)
    async function insertionWorker(data, autoSave = false) {
        try {
            console.log('[Extension] insertionWorker called');
            let inserted = false;

            // 1. Insert SOAP
            if (data.soap) {
                const map = {
                    'subjective': ['subjective', 'soap_subjective', 's_text'],
                    'objective': ['objective', 'soap_objective', 'o_text'],
                    'assessment': ['assessment', 'soap_assessment', 'a_text'],
                    'plan': ['plan', 'soap_plan', 'p_text']
                };

                for (const [key, ids] of Object.entries(map)) {
                    const value = data.soap[key];
                    if (!value) continue;

                    for (const id of ids) {
                        let el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
                        if (el) {
                            el.value = value;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            inserted = true;
                            break;
                        }
                    }
                }
            }

            // 2. Insert Codes (Fee Sheet) - ROBUST VERSION
            if (data.icdCodes || data.cptCodes) {
                console.log('[Extension] Attempting to insert codes...');

                // Helper to find the table
                const findFeeSheetTable = () => {
                    console.log('[Extension] Searching for Fee Sheet table...');

                    // Strategy 1: Look for specific heading text
                    const headings = Array.from(document.querySelectorAll('h2, h3, h4, div.title, div, span'));
                    console.log(`[Extension] Found ${headings.length} potential headings`);

                    for (const h of headings) {
                        const text = h.innerText || h.textContent || '';
                        if (text.includes('Selected Fee Sheet Codes') ||
                            text.includes('Fee Sheet Codes and Charges') ||
                            text.includes('Current Encounter')) {
                            console.log('[Extension] Found heading:', text.substring(0, 50));

                            // Look for table following this heading
                            let next = h.nextElementSibling;
                            let attempts = 0;
                            while (next && attempts < 10) {
                                if (next.tagName === 'TABLE') {
                                    console.log('[Extension] Found table after heading!');
                                    return next;
                                }
                                // Also check inside the next element
                                const tableInside = next.querySelector('table');
                                if (tableInside) {
                                    console.log('[Extension] Found table inside element after heading!');
                                    return tableInside;
                                }
                                next = next.nextElementSibling;
                                attempts++;
                            }

                            // Also check parent's next sibling
                            if (h.parentElement) {
                                const parentNext = h.parentElement.nextElementSibling;
                                if (parentNext) {
                                    const tableInParent = parentNext.querySelector('table');
                                    if (tableInParent) {
                                        console.log('[Extension] Found table in parent next sibling!');
                                        return tableInParent;
                                    }
                                }
                            }
                        }
                    }

                    // Strategy 2: Look for table with specific headers
                    const tables = Array.from(document.querySelectorAll('table'));
                    console.log(`[Extension] Found ${tables.length} tables total`);

                    for (const table of tables) {
                        const tableText = table.innerText.toLowerCase();
                        if (tableText.includes('type') &&
                            tableText.includes('code') &&
                            tableText.includes('description')) {
                            console.log('[Extension] Found table with Type/Code/Description headers!');
                            return table;
                        }
                    }

                    // Strategy 3: Look for table with specific column count (Fee Sheet typically has 8-10 columns)
                    for (const table of tables) {
                        const firstRow = table.querySelector('tr');
                        if (firstRow) {
                            const cellCount = firstRow.querySelectorAll('td, th').length;
                            if (cellCount >= 8 && cellCount <= 12) {
                                const rowText = firstRow.innerText.toLowerCase();
                                if (rowText.includes('type') || rowText.includes('code')) {
                                    console.log(`[Extension] Found table with ${cellCount} columns matching Fee Sheet pattern!`);
                                    return table;
                                }
                            }
                        }
                    }

                    console.error('[Extension] Could not find Fee Sheet table');
                    return null;
                };

                const table = findFeeSheetTable();

                if (table) {
                    console.log('[Extension] Found Fee Sheet table');
                    const tbody = table.querySelector('tbody') || table;

                    // 1. Find the Header Row
                    let headerRow = null;
                    const allRows = Array.from(tbody.querySelectorAll('tr'));

                    for (const row of allRows) {
                        const text = row.innerText.toLowerCase();
                        if (text.includes('type') && text.includes('code') && text.includes('description')) {
                            headerRow = row;
                            break;
                        }
                    }

                    // 2. Force Header to Top
                    if (headerRow) {
                        if (tbody.firstElementChild !== headerRow) {
                            tbody.prepend(headerRow);
                        }
                    } else {
                        // Fallback: Check THEAD
                        const thead = table.querySelector('thead');
                        if (thead) {
                            const theadRow = thead.querySelector('tr');
                            if (theadRow && theadRow.innerText.toLowerCase().includes('type')) {
                                headerRow = theadRow;
                            }
                        }
                        // Fallback: Use first row
                        if (!headerRow && allRows.length > 0) {
                            headerRow = allRows[0];
                        }
                    }

                    // 3. Prepare New Rows (with robust duplicate prevention)
                    const fragment = document.createDocumentFragment();
                    let insertedCount = 0;
                    let skippedCount = 0;

                    // Helper to check if code already exists in table (more robust)
                    const codeExists = (codeValue, codeType) => {
                        // Check all rows in the entire table, not just tbody
                        const allTableRows = Array.from(table.querySelectorAll('tr'));

                        for (const row of allTableRows) {
                            const cells = row.querySelectorAll('td, th');
                            if (cells.length >= 2) {
                                const rowType = (cells[0].innerText || cells[0].textContent || '').trim().toUpperCase();
                                const rowCode = (cells[1].innerText || cells[1].textContent || '').trim();

                                // Normalize type names for comparison
                                const normalizedType = codeType.replace(/\s/g, '').toUpperCase();
                                const normalizedRowType = rowType.replace(/\s/g, '').toUpperCase();

                                if (normalizedRowType === normalizedType && rowCode === codeValue) {
                                    console.log(`[Extension] Found existing code: ${codeType} ${codeValue}`);
                                    return true;
                                }
                            }
                        }
                        return false;
                    };

                    const createCodeRow = (code, type) => {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-extension-inserted', 'true');
                        tr.setAttribute('data-code', code.code); // Add for easier tracking
                        tr.setAttribute('data-type', type);
                        tr.style.backgroundColor = '#f9f9f9';

                        const inputStyle = "width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px;";

                        tr.innerHTML = `
                            <td style="padding: 8px;">${type}</td>
                            <td style="padding: 8px;">${code.code}</td>
                            <td style="padding: 8px;" title="${code.description || ''}">
                                <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:350px;cursor:pointer;"
                                     onclick="this.style.whiteSpace=this.style.whiteSpace==='normal'?'nowrap':'normal'">
                                    ${code.description || ''}
                                </div>
                            </td>
                            <td style="padding: 8px;"><input type="text" style="${inputStyle}"></td>
                            <td style="padding: 8px;"><input type="text" value="${code.price || ''}" style="${inputStyle}"></td>
                            <td style="padding: 8px;"><input type="text" value="${type === 'CPT4' ? '1' : ''}" style="${inputStyle}"></td>
                            <td style="padding: 8px;"><select style="${inputStyle}"><option></option></select></td>
                            <td style="padding: 8px;"><input type="text" style="${inputStyle}"></td>
                            <td style="padding: 8px; text-align: center;"><input type="checkbox"></td>
                            <td style="padding: 8px; text-align: center;"><input type="checkbox"></td>
                        `;
                        return tr;
                    };

                    // Add ICD codes (skip duplicates)
                    if (data.icdCodes && data.icdCodes.length > 0) {
                        console.log(`[Extension] Processing ${data.icdCodes.length} ICD codes...`);
                        data.icdCodes.forEach(code => {
                            if (!codeExists(code.code, 'ICD10')) {
                                fragment.appendChild(createCodeRow(code, 'ICD10'));
                                insertedCount++;
                                console.log(`[Extension] Adding ICD10: ${code.code}`);
                            } else {
                                skippedCount++;
                                console.log(`[Extension] ⚠️ Skipping duplicate ICD10 code: ${code.code}`);
                            }
                        });
                    }

                    // Add CPT codes (skip duplicates)
                    if (data.cptCodes && data.cptCodes.length > 0) {
                        console.log(`[Extension] Processing ${data.cptCodes.length} CPT codes...`);
                        data.cptCodes.forEach(code => {
                            if (!codeExists(code.code, 'CPT4')) {
                                fragment.appendChild(createCodeRow(code, 'CPT4'));
                                insertedCount++;
                            } else {
                                console.log(`[Extension] Skipping duplicate CPT4 code: ${code.code}`);
                            }
                        });
                    }

                    // 4. Insert Fragment
                    if (insertedCount > 0) {
                        if (headerRow) {
                            headerRow.after(fragment);
                        } else {
                            tbody.appendChild(fragment);
                        }
                        inserted = true;
                        console.log(`[Extension] Inserted ${insertedCount} rows`);
                    }
                } else {
                    console.warn('[Extension] Fee Sheet table NOT found');
                }
            }

            return { success: inserted };
        } catch (e) {
            console.error('[Extension] Worker Error:', e);
            return { success: false, error: e.message };
        }
    }

    // --- Copy to Clipboard Function ---
    async function copyToClipboard(event) {
        const btn = event ? event.target.closest('.copy-action-btn') : document.querySelector('.copy-action-btn');
        const originalText = btn ? btn.innerHTML : 'Copy';

        try {
            let textToCopy = '';

            // If we have generated data (SOAP/Codes), use that
            if (lastGeneratedData) {
                if (lastGeneratedData.soap) {
                    textToCopy += 'SOAP NOTE:\n\n';
                    textToCopy += `S: ${lastGeneratedData.soap.subjective}\n\n`;
                    textToCopy += `O: ${lastGeneratedData.soap.objective}\n\n`;
                    textToCopy += `A: ${lastGeneratedData.soap.assessment}\n\n`;
                    textToCopy += `P: ${lastGeneratedData.soap.plan}\n\n`;
                }

                if (lastGeneratedData.icdCodes && lastGeneratedData.icdCodes.length > 0) {
                    textToCopy += '\nICD-10 CODES:\n';
                    lastGeneratedData.icdCodes.forEach(code => {
                        textToCopy += `• ${code.code} - ${code.description}\n`;
                    });
                    textToCopy += '\n';
                }

                if (lastGeneratedData.cptCodes && lastGeneratedData.cptCodes.length > 0) {
                    textToCopy += 'CPT CODES:\n';
                    lastGeneratedData.cptCodes.forEach(code => {
                        textToCopy += `• ${code.code} - ${code.description}\n`;
                    });
                }
            }

            // If no generated data, copy the message content text
            if (!textToCopy && btn) {
                const messageDiv = btn.closest('.message');
                if (messageDiv) {
                    const contentDiv = messageDiv.querySelector('.message-content');
                    if (contentDiv) {
                        // Get text content, stripping HTML
                        textToCopy = contentDiv.innerText || contentDiv.textContent || '';
                    }
                }
            }

            if (!textToCopy) {
                alert('Nothing to copy!');
                return;
            }

            // Copy to clipboard
            await navigator.clipboard.writeText(textToCopy);

            // Update button to show success
            if (btn) {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Copied!
                `;
                btn.style.backgroundColor = '#2e7d32';
                btn.style.borderColor = '#2e7d32';
                btn.style.color = 'white';

                // Reset after 2 seconds
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.style.backgroundColor = '';
                    btn.style.borderColor = '';
                    btn.style.color = '';
                }, 2000);
            }
        } catch (error) {
            console.error(error);
            alert('Error copying to clipboard: ' + error.message);
        }
    }


})();
