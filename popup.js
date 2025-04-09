(() => {
    // Webpack bootstrap/module handling (simplified representation)
    var e = { 449: () => {} }, t = {};
    function r(o) { /* ... webpack runtime ... */ }
    r.n = e => { /* ... */ };
    r.d = (e, t) => { /* ... */ };
    r.o = (e, t) => Object.prototype.hasOwnProperty.call(e, t);

    (() => {
        "use strict";

        // r(449); // If you still have other webpack modules

        // --- Popup initialization logic ---
        document.addEventListener("DOMContentLoaded", (() => {
            const calculateButton = document.getElementById("button");
            const clearAllButton = document.getElementById("clear-all-button");
            const resultsContainer = document.getElementById("results-container");
            const calculationInfoContainer = document.getElementById("calculation-info");
            const versionDisplay = document.getElementById("version-display");
            const versionNumberSpan = document.getElementById("version-number");
            const toggleSettingsButton = document.getElementById("toggle-settings");
            const settingsContainer = document.getElementById("settings-container");
            const decimalPlacesSelect = document.getElementById('decimalPlaces');
            const autoCalculateCheckbox = document.getElementById('autoCalculate');
            const darkModeCheckbox = document.getElementById('darkModeCheckbox'); // Get the dark mode checkbox
            const saveSettingsButton = document.getElementById('saveSettings');
            const body = document.body;
            let activeTabId = null;
            let decimalPlaces = 6; // Default value
            let storedDataCache = {}; // Cache for stored results

            // Function to get the extension's version from the manifest
            async function getExtensionVersion() {
                try {
                    const manifest = chrome.runtime.getManifest();
                    return manifest.version;
                } catch (error) {
                    console.error("Error getting manifest:", error);
                    return "N/A";
                }
            }

            // Display the version number
            getExtensionVersion().then(version => {
                if (versionNumberSpan) {
                    versionNumberSpan.textContent = version;
                }
            });

            // Load settings from storage
            chrome.storage.sync.get(['theme', 'decimalPlaces', 'autoCalculate'], (settings) => {
                const theme = settings.theme || 'light';
                decimalPlaces = settings.decimalPlaces === undefined ? 6 : parseInt(settings.decimalPlaces);
                const autoCalculate = settings.autoCalculate || false;

                if (theme === 'dark') {
                    body.classList.add('dark-mode');
                    darkModeCheckbox.checked = true;
                } else {
                    body.classList.remove('dark-mode');
                    darkModeCheckbox.checked = false;
                }
                decimalPlacesSelect.value = decimalPlaces.toString();
                autoCalculateCheckbox.checked = autoCalculate;

                // Apply auto-calculate on page load if enabled
                if (autoCalculate) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs && tabs.length > 0 && tabs[0].id) {
                            executeContentScript(tabs[0].id);
                        }
                    });
                }
            });

            async function getTabTitle(tabId) {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    return tab.title;
                } catch (error) {
                    console.error("Error getting tab title:", error);
                    return `Tab ${tabId}`; // Fallback
                }
            }

            function displayStoredResults(storedData) {
                storedDataCache = storedData; // Update the cache
                resultsContainer.innerHTML = '';
                if (Object.keys(storedData).length === 0) {
                    const noDataMessage = document.createElement('p');
                    noDataMessage.textContent = "No stored results yet.";
                    resultsContainer.appendChild(noDataMessage);
                    return;
                }

                const resultsList = document.createElement('ul');
                for (const tabId in storedData) {
                    if (storedData.hasOwnProperty(tabId)) {
                        const data = storedData[tabId];
                        const listItem = document.createElement('li');
                        const tabTitle = data.title ? data.title : `Tab ${tabId}`;
                        listItem.textContent = `${tabTitle}: Average ${data.average !== undefined ? data.average.toFixed(decimalPlaces) : 'N/A'} (${data.count} items)`;
                        resultsList.appendChild(listItem);
                    }
                }
                resultsContainer.appendChild(resultsList);
            }

            // Load stored results when the popup opens
            chrome.storage.local.get(null, displayStoredResults);

            // Listen for the "refreshStoredResults" message from the background script
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === "refreshStoredResults") {
                    console.log("[Popup] Received refresh request, reloading stored results.");
                    chrome.storage.local.get(null, (updatedItems) => {
                        displayStoredResults(updatedItems);
                        // Update the status message only if there are results for the current tab
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (tabs && tabs.length > 0 && tabs[0].id && request.result) {
                                const currentTabId = tabs[0].id.toString();
                                if (request.result.average !== undefined && request.result.count !== undefined) {
                                    const successMessage = `Found ${request.result.count} potential elements. Successfully parsed ${request.result.count} floats.\nAverage: ${request.result.average.toFixed(decimalPlaces)}`;
                                    console.log(successMessage);
                                    calculationInfoContainer.classList.remove('error');
                                    calculationInfoContainer.textContent = successMessage;
                                } else if (request.error) {
                                    calculationInfoContainer.textContent = request.error;
                                    calculationInfoContainer.classList.add('error');
                                } else {
                                    calculationInfoContainer.textContent = ""; // Clear previous messages
                                }
                            } else if (Object.keys(updatedItems).length === 0) {
                                calculationInfoContainer.textContent = "No results stored yet.";
                            } else {
                                calculationInfoContainer.textContent = ""; // Clear if no result for current tab
                            }
                        });
                    });
                }
            });

            // Function to execute the content script
            function executeContentScript(tabId) {
                calculateButton.disabled = true;
                calculationInfoContainer.textContent = "Calculating...";

                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    function: () => {
                        // This is the content of your injected script
                        const elements = document.querySelectorAll("span.ItemListView-wear, div.wear.ng-star-inserted");
                        const totalElementsFound = elements.length;
                        if (totalElementsFound === 0) {
                            return { error: "No float elements found..." };
                        }
                        const floats = [];
                        let failedParses = 0;
                        const floatPattern = /\((\d+(\.\d+)?)\)/;

                        elements.forEach(element => {
                            const textContent = element.textContent;
                            let floatValueStr = null;
                            const match = textContent.match(floatPattern);
                            if (match && match[1]) {
                                floatValueStr = match[1];
                            } else if (/^-?\d+(\.\d+)?$/.test(textContent.trim())) {
                                floatValueStr = textContent.trim();
                            }

                            if (floatValueStr) {
                                const parsedFloat = parseFloat(floatValueStr);
                                if (isNaN(parsedFloat)) failedParses++;
                                else floats.push(parsedFloat);
                            } else if (textContent.trim() !== "") failedParses++;
                        });

                        if (floats.length === 0) {
                            return { error: `Found ${totalElementsFound} potential elements, but failed to parse any valid numbers.`, totalElementsFound };
                        }
                        const average = floats.reduce((sum, val) => sum + val, 0) / floats.length;
                        const result = { average: average, count: floats.length, totalElementsFound };

                        // Send the message from the content script
                        chrome.runtime.sendMessage({
                            action: "storeCalculationResult",
                            average: result.average,
                            count: result.count,
                            result: result // Include the result in the message
                        });

                        return result; // Optionally return the result to the popup if needed
                    }
                }, (injectionResults) => {
                    calculateButton.disabled = false;
                    calculationInfoContainer.textContent = ""; // Clear the "Calculating..." message

                    if (chrome.runtime.lastError) {
                        return console.error("Script injection failed:", chrome.runtime.lastError.message);
                    }
                    if (!injectionResults || injectionResults.length === 0 || !injectionResults[0].result) {
                        return console.error("Content script did not return a result.");
                    }

                    const result = injectionResults[0].result;

                    // The success/error message is now handled in the refresh listener
                });
            }

            // Check current tab on popup load and potentially auto-calculate
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs => {
                if (chrome.runtime.lastError) {
                    return void console.error("Error querying tabs:", chrome.runtime.lastError.message);
                }
                if (!tabs || tabs.length === 0 || !tabs[0].url) {
                    return;
                }

                const currentTab = tabs[0];
                let hostname;
                activeTabId = currentTab.id;

                try {
                    hostname = new URL(currentTab.url).hostname;
                } catch (e) {
                    calculateButton.disabled = true;
                    return;
                }

                const isSupportedSite = ["skinport.com", "csfloat.com"].some(domain => hostname === domain || hostname.endsWith("." + domain));
                calculateButton.disabled = !isSupportedSite;

                // Auto-calculate is handled on settings load now
            }));

            // --- Button click listener ---
            calculateButton.addEventListener("click", (() => {
                if (activeTabId) {
                    executeContentScript(activeTabId);
                } else {
                    calculationInfoContainer.textContent = "Could not identify the active tab.";
                    calculationInfoContainer.classList.add('error');
                }
            }));

            // --- Clear All Button Listener ---
            if (clearAllButton) {
                clearAllButton.textContent = "Clear All"; // Change button text

                clearAllButton.addEventListener("click", () => {
                    chrome.storage.local.clear(() => {
                        if (chrome.runtime.lastError) {
                            console.error("Error clearing storage:", chrome.runtime.lastError);
                            calculationInfoContainer.textContent = "Error clearing stored data.";
                            calculationInfoContainer.classList.add('error');
                        } else {
                            console.log("All stored results cleared.");
                            calculationInfoContainer.textContent = "Stored results cleared.";
                            calculationInfoContainer.classList.remove('error');
                            // Update the displayed list to be empty
                            chrome.storage.local.get(null, displayStoredResults);
                        }
                    });
                });
            }

            // --- Toggle Settings Visibility ---
            toggleSettingsButton.addEventListener('click', () => {
                settingsContainer.style.display = settingsContainer.style.display === 'none' ? 'block' : 'none';
            });

            // --- Save Settings ---
            saveSettingsButton.addEventListener('click', () => {
                const selectedDecimalPlaces = parseInt(decimalPlacesSelect.value);
                const autoCalcEnabled = autoCalculateCheckbox.checked;
                const darkModeEnabled = document.getElementById('darkModeCheckbox').checked; // Get the state of the checkbox
                const selectedTheme = darkModeEnabled ? 'dark' : 'light'; // Determine the theme based on the checkbox state

                chrome.storage.sync.set({
                    decimalPlaces: selectedDecimalPlaces,
                    autoCalculate: autoCalcEnabled,
                    theme: selectedTheme
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Error saving settings:", chrome.runtime.lastError);
                        calculationInfoContainer.textContent = "Error saving settings.";
                        calculationInfoContainer.classList.add('error');
                    } else {
                        decimalPlaces = selectedDecimalPlaces; // Update local variable
                        if (selectedTheme === 'dark') {
                            body.classList.add('dark-mode');
                        } else {
                            body.classList.remove('dark-mode');
                        }
                        displayStoredResults(storedDataCache); // Re-render with new decimal places
                        calculationInfoContainer.textContent = "Settings saved!";
                        calculationInfoContainer.classList.remove('error'); // Ensure error class is removed
                        setTimeout(() => {
                            calculationInfoContainer.textContent = "";
                        }, 1500);
                    }
                });
            });

            // Initialize storedDataCache on load
            chrome.storage.local.get(null, (items) => {
                storedDataCache = items;
            });

        })); // --- End of DOMContentLoaded listener ---

    })(); // --- End of main IIFE ---

})(); // --- End of outer IIFE ---

// Source mapping comment from original file