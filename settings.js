document.addEventListener('DOMContentLoaded', () => {
    const decimalPlacesSelect = document.getElementById('decimalPlaces');
    const autoCalculateCheckbox = document.getElementById('autoCalculate');
    const lightModeRadio = document.getElementById('lightMode');
    const darkModeRadio = document.getElementById('darkMode');
    const saveButton = document.getElementById('saveSettings');

    // Load saved settings
    chrome.storage.sync.get(['decimalPlaces', 'autoCalculate', 'theme'], (settings) => {
        decimalPlacesSelect.value = settings.decimalPlaces || '6';
        autoCalculateCheckbox.checked = settings.autoCalculate || false;
        const savedTheme = settings.theme || 'light';
        if (savedTheme === 'dark') {
            darkModeRadio.checked = true;
        } else {
            lightModeRadio.checked = true;
        }
    });

    // Save settings when the button is clicked
    saveButton.addEventListener('click', () => {
        const decimalPlaces = parseInt(decimalPlacesSelect.value);
        const autoCalculate = autoCalculateCheckbox.checked;
        const theme = document.querySelector('input[name="theme"]:checked').value;

        chrome.storage.sync.set({ decimalPlaces, autoCalculate, theme }, () => {
            alert('Settings saved!');
        });
    });
});