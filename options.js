// Load options on page load
document.addEventListener('DOMContentLoaded', loadOptions);

// Save options when button clicked
document.getElementById('saveOptions').addEventListener('click', saveOptions);

function loadOptions() {
  chrome.storage.sync.get({
    apiKey: '',
    enableValidation: true,
    autoLink: true,
    icd10: true,
    cpt: true,
    snomed: true,
    maxTextLength: 50000
  }, function(items) {
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('enableValidation').checked = items.enableValidation;
    document.getElementById('autoLink').checked = items.autoLink;
    document.getElementById('icd10').checked = items.icd10;
    document.getElementById('cpt').checked = items.cpt;
    document.getElementById('snomed').checked = items.snomed;
    document.getElementById('maxTextLength').value = items.maxTextLength;
  });
}

function saveOptions() {
  const options = {
    apiKey: document.getElementById('apiKey').value,
    enableValidation: document.getElementById('enableValidation').checked,
    autoLink: document.getElementById('autoLink').checked,
    icd10: document.getElementById('icd10').checked,
    cpt: document.getElementById('cpt').checked,
    snomed: document.getElementById('snomed').checked,
    maxTextLength: parseInt(document.getElementById('maxTextLength').value)
  };

  chrome.storage.sync.set(options, function() {
    const button = document.getElementById('saveOptions');
    const originalText = button.textContent;
    button.textContent = 'Saved!';
    setTimeout(() => button.textContent = originalText, 2000);
  });
}
