// SOAP Assistant popup behavior
const getContentBtn = document.getElementById('getContent');
const generateSoapTop = document.getElementById('generateSoapTop');
const regenerateBtn = document.getElementById('regenerateSoap');
const clearAllBtn = document.getElementById('clearAll');
const saveBtn = document.getElementById('saveBtn');
const extractedTextEl = document.getElementById('extractedText');
const statusEl = document.getElementById('status');
const contentArea = document.getElementById('contentArea');
const resultSection = document.getElementById('resultSection');
const soapSubjective = document.getElementById('soapSubjective');
const soapObjective = document.getElementById('soapObjective');
const soapAssessment = document.getElementById('soapAssessment');
const soapPlan = document.getElementById('soapPlan');
const icdCodesGrid = document.getElementById('icdCodesGrid');
const cptCodesGrid = document.getElementById('cptCodesGrid');

function setStatus(msg, busy = false) {
  statusEl.innerHTML = msg + (busy ? ' <span class="spinner"></span>' : '');
}

// Clear all content with X button
clearAllBtn.addEventListener('click', () => {
  extractedTextEl.value = '';
  generateSoapTop.disabled = true;
  generateSoapTop.textContent = 'Generate SOAP';
  extractedTextEl.style.display = 'block'; // show textarea again
  contentArea.style.display = 'none';
  resultSection.style.display = 'none';
  regenerateBtn.style.display = 'none';
  chrome.storage.local.remove(['lastExtraction']);
  setStatus('Cleared');
});

// Close results with X button
document.getElementById('closeResults').addEventListener('click', () => {
  extractedTextEl.style.display = 'block'; // show textarea again
  resultSection.style.display = 'none';
  regenerateBtn.style.display = 'none';
  generateSoapTop.textContent = 'Generate SOAP'; // reset button
});

// Result tab switching
document.getElementById('tabSoap').addEventListener('click', () => switchResultTab('soap'));
document.getElementById('tabCodesResult').addEventListener('click', () => switchResultTab('codes'));

function switchResultTab(tab) {
  const tabSoap = document.getElementById('tabSoap');
  const tabCodesResult = document.getElementById('tabCodesResult');
  const soapContent = document.getElementById('soapContent');
  const codesResultContent = document.getElementById('codesResultContent');

  if (tab === 'soap') {
    tabSoap.classList.add('active');
    tabCodesResult.classList.remove('active');
    soapContent.classList.add('active');
    codesResultContent.classList.remove('active');
  } else {
    tabCodesResult.classList.add('active');
    tabSoap.classList.remove('active');
    codesResultContent.classList.add('active');
    soapContent.classList.remove('active');
  }
}

// Get content button handler
getContentBtn.addEventListener('click', async () => {
  try {
    setStatus('Extracting content...', true);
    getContentBtn.disabled = true;
    contentArea.style.display = 'none';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { setStatus('No active tab'); getContentBtn.disabled = false; return; }

    // Execute extraction in all frames and aggregate
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      function: pageExtractor
    });

    if (!results || results.length === 0) {
      setStatus('Failed to run extractor');
      getContentBtn.disabled = false;
      return;
    }

    const agg = aggregateResults(results.map(r => r.result).filter(Boolean));

    // show extracted text
    extractedTextEl.value = agg.text || '';

    // enable generate
    generateSoapTop.disabled = false;
    contentArea.style.display = 'block';
    setStatus('Extraction completed.');

    // persist last extraction
    chrome.storage.local.set({ lastExtraction: agg });
  } catch (err) {
    setStatus('Error: ' + (err.message || err));
  } finally {
    getContentBtn.disabled = false;
  }
});

// Improved aggregation with error handling
function aggregateResults(results) {
  const aggregate = { text: '', codes: {}, totalCodes: 0, extractionTime: 0 };
  const start = Date.now();

  for (const r of results) {
    if (!r) continue;
    aggregate.text += (r.text || '') + '\n';
    for (const [type, list] of Object.entries(r.codes || {})) {
      if (!aggregate.codes[type]) aggregate.codes[type] = new Set();
      for (const c of (list || [])) if (c && c.toString().trim()) aggregate.codes[type].add(c.toString().trim());
    }
  }

  for (const k of Object.keys(aggregate.codes)) {
    aggregate.codes[k] = Array.from(aggregate.codes[k]);
    aggregate.totalCodes += aggregate.codes[k].length;
  }
  aggregate.extractionTime = Date.now() - start;
  return aggregate;
}

// The function that will run in the page context to extract text and codes
function pageExtractor() {
  try {
    const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'IMG', 'SVG', 'CANVAS', 'INPUT', 'BUTTON', 'SELECT', 'OPTION']);
    let text = (document.body && document.body.innerText) ? document.body.innerText : '';

    const hintSelectors = '[class*=note],[class*=notes],[class*=clinical],[class*=narrative],[id*=note],[id*=notes],[id*=clinical],[id*=narrative],[class*=visit],[id*=visit],[class*=encounter],[id*=encounter]';
    try {
      const hints = document.querySelectorAll(hintSelectors);
      hints.forEach(el => { if (el && el.innerText) text += '\n' + el.innerText; });
    } catch (e) { }

    const inputs = document.querySelectorAll('textarea, input[type=text], [contenteditable="true"]');
    inputs.forEach(i => { try { text += '\n' + (i.value || i.innerText || i.textContent || ''); } catch (e) { } });

    text = text.replace(/\u00A0/g, ' ').replace(/\s+/, ' ').trim();

    const codes = {};
    const icdRegex = /\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b/g;
    const icd = (text.match(icdRegex) || []).map(s => s.trim());
    codes['ICD-10'] = [...new Set(icd)];

    const cptRegex = /\b\d{5}\b/g;
    const cpt = (text.match(cptRegex) || []).map(s => s.trim());
    codes['CPT'] = [...new Set(cpt)];

    const snomedRegex = /(?:SNOMED[: ]+CT[: ]*)?(\d{6,18})/gi;
    let sm = [];
    let m;
    while ((m = snomedRegex.exec(text)) !== null) sm.push(m[1]);
    codes['SNOMED'] = [...new Set(sm)];

    return { text: text.substring(0, 16000), codes };
  } catch (err) {
    return { text: '', codes: {} };
  }
}

function populateResults(soapContent, codes) {
  window.generatedSOAP = soapContent;
  window.generatedCodes = codes;

  soapSubjective.textContent = soapContent.subjective || '';
  soapObjective.textContent = soapContent.objective || '';
  soapAssessment.textContent = soapContent.assessment || '';
  soapPlan.textContent = soapContent.plan || '';

  icdCodesGrid.innerHTML = '';
  (codes.icd10 || []).forEach(code => {
    const pill = document.createElement('div');
    pill.className = 'code-pill';
    pill.innerHTML = `<span class="code-text">${code.code || code}</span>`;
    icdCodesGrid.appendChild(pill);
  });

  cptCodesGrid.innerHTML = '';
  (codes.cpt || []).forEach(code => {
    const pill = document.createElement('div');
    pill.className = 'code-pill';
    pill.innerHTML = `<span class="code-text">${code.code || code}</span>`;
    cptCodesGrid.appendChild(pill);
  });

  generateSoapTop.textContent = 'Regenerate SOAP';
  if (saveBtn) {
    saveBtn.style.display = 'block';
  }
  setStatus('SOAP generated');
}

async function generateSoap() {
  const content = extractedTextEl.value.trim();
  if (!content) { setStatus('No content to send'); return; }

  setStatus('Generating SOAP...', true);
  generateSoapTop.disabled = true;
  regenerateBtn.disabled = true;

  try {
    const options = await new Promise(resolve => chrome.storage.sync.get({ apiKey: '' }, resolve));
    const apiKey = options.apiKey || '';

    console.log('Retrieved API key:', apiKey ? '[SET]' : '[NOT SET]');

    if (!apiKey) {
      setStatus('Please set your Anthropic API key in the extension options.');
      generateSoapTop.disabled = false;
      regenerateBtn.disabled = false;
      return;
    }

    const res = await new Promise(resolve => chrome.storage.local.get(['lastExtraction'], resolve));
    const codes = res.lastExtraction?.codes || {};

    let codesInfo = '';
    if (Object.keys(codes).length > 0) {
      codesInfo = 'Extracted codes:\n';
      Object.entries(codes).forEach(([type, list]) => {
        if (list.length > 0) codesInfo += `${type}: ${list.join(', ')}\n`;
      });
    }

    const truncatedContent = content.length > 4000 ? content.substring(0, 4000) + '...' : content;

    const prompt = `You are a clinical scribe. Based on the clinical content below, generate a concise SOAP note (keep each section under 150 words) with suggested ICD-10 and CPT codes.

IMPORTANT: Return ONLY valid JSON in this exact format. Do not include any markdown, code fences, explanations, or additional text before or after. Just the JSON object:

{
  "soap_content": {
    "subjective": "Brief subjective section...",
    "objective": "Brief objective findings...",
    "assessment": "Brief assessment...",
    "plan": "Brief plan..."
  },
  "codes": {
    "icd10": [{"code": "A01.0", "description": "Brief description"}],
    "cpt": [{"code": "99201", "description": "Brief description"}]
  }
}

Clinical content:
${truncatedContent}

${codesInfo}

Output only the JSON, start with { and end with }:`;

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
        max_tokens: 2048
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      setStatus('API error: ' + resp.status + ' ' + errText);
      generateSoapTop.disabled = false;
      regenerateBtn.disabled = false;
      return;
    }

    const data = await resp.json();
    const answer = data.content?.[0]?.text || '';

    let parsed;
    try {
      parsed = JSON.parse(answer.trim());
    } catch (e) {
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          setStatus('Failed to parse AI response: ' + answer.substring(0, 200) + '...');
          generateSoapTop.disabled = false;
          regenerateBtn.disabled = false;
          return;
        }
      } else {
        setStatus('No JSON found in AI response: ' + answer.substring(0, 200) + '...');
        generateSoapTop.disabled = false;
        regenerateBtn.disabled = false;
        return;
      }
    }

    extractedTextEl.style.display = 'none';
    resultSection.style.display = 'block';
    populateResults(parsed.soap_content || {}, parsed.codes || {});
  } catch (e) {
    setStatus('Generation failed: ' + (e.message || e));
  } finally {
    generateSoapTop.disabled = false;
    regenerateBtn.disabled = false;
  }
}

generateSoapTop.addEventListener('click', generateSoap);
regenerateBtn.addEventListener('click', generateSoap);

if (saveBtn) {
  saveBtn.addEventListener('click', saveToOpenEMR);
}

async function saveToOpenEMR() {
  setStatus('Saving to OpenEMR...', true);
  saveBtn.disabled = true;

  const soap = window.generatedSOAP || {};
  const codes = window.generatedCodes || {};

  try {
    const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) {
      setStatus('No active OpenEMR tab found');
      saveBtn.disabled = false;
      return;
    }

    const frameResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      args: [soap, codes],
      function: (soapArg, codesArg) => {
        try {
          const interfaceIndex = location.pathname.indexOf('/interface/');
          const webroot = interfaceIndex !== -1 ? location.pathname.substr(0, interfaceIndex) : '';

          let urlParams = new URLSearchParams(window.location.search || '');
          let pid = urlParams.get('pid') || urlParams.get('patient_id');
          let eid = urlParams.get('encounter_id') || urlParams.get('id') || urlParams.get('eid');

          if (!pid) {
            const pidEls = document.querySelectorAll('input[name*="pid"], input[id*="pid"], input[name*="patient_id"]');
            for (const el of pidEls) if (el && el.value && el.value.trim()) { pid = el.value.trim(); break; }
          }
          if (!eid) {
            const eidEls = document.querySelectorAll('input[name*="encounter"], input[name*="eid"], input[id*="encounter"]');
            for (const el of eidEls) if (el && el.value && el.value.trim()) { eid = el.value.trim(); break; }
          }

          if (!pid && window.patient_id) pid = window.patient_id;
          if (!pid && window.pid) pid = window.pid;
          if (!eid && window.encounter_id) eid = window.encounter_id;
          if (!eid && window.eid) eid = window.eid;

          if (!pid || !eid) return { found: false };

          const apiUrl = `${location.origin}${webroot}/apis/save_soap_extension.php`;
          const payload = new FormData();
          payload.append('pid', pid);
          payload.append('eid', eid);
          payload.append('subjective', soapArg.subjective || '');
          payload.append('objective', soapArg.objective || '');
          payload.append('assessment', soapArg.assessment || '');
          payload.append('plan', soapArg.plan || '');
          payload.append('metadata', JSON.stringify({ generated_by: 'LLM SOAP Assistant', codes: codesArg }));

          return fetch(apiUrl, {
            method: 'POST',
            credentials: 'same-origin',
            body: payload
          }).then(async (res) => {
            const txt = await res.text();
            let data = null;
            try { data = JSON.parse(txt); } catch (e) { data = txt; }
            return { found: true, ok: res.ok, status: res.status, data, url: apiUrl };
          }).catch(err => ({ found: true, ok: false, error: err && err.message }));
        } catch (err) {
          return { found: false, error: err && err.message };
        }
      }
    });

    const performed = frameResults.map(r => r.result).find(res => res && res.found);
    if (!performed) {
      setStatus('Auto-detect failed.');
      saveBtn.disabled = false;
      return;
    }

    if (!performed.ok) {
      setStatus('Save failed: ' + (performed.error || JSON.stringify(performed.data)));
      saveBtn.disabled = false;
      return;
    }

    setStatus('SOAP saved successfully!');
    chrome.scripting.executeScript({ target: { tabId: tab.id }, function: () => location.reload() });

  } catch (err) {
    setStatus('Save failed: ' + (err && err.message));
  } finally {
    saveBtn.disabled = false;
  }
}
