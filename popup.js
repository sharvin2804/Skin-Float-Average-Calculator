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
            const darkModeCheckbox = document.getElementById("darkModeCheckbox");
            const body = document.body;
            let activeTabId = null;

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

            // Load dark mode preference from storage
            chrome.storage.local.get('darkMode', (data) => {
                const isDarkMode = data.darkMode;
                if (isDarkMode) {
                    body.classList.add('dark-mode');
                    darkModeCheckbox.checked = true;
                }
            });

            // Listen for dark mode toggle changes
            darkModeCheckbox.addEventListener('change', () => {
                body.classList.toggle('dark-mode');
                chrome.storage.local.set({ darkMode: darkModeCheckbox.checked });
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
                        listItem.textContent = `${tabTitle}: Average ${data.average.toFixed(6)} (${data.count} items)`;
                        resultsList.appendChild(listItem);
                    }
                }
                resultsContainer.appendChild(resultsList);
            }

            // Load stored results when the popup opens
            chrome.storage.local.get(null, (items) => {
                if (chrome.runtime.lastError) {
                    console.error("Error retrieving data from storage:", chrome.runtime.lastError);
                    const errorMessage = document.createElement('p');
                    errorMessage.classList.add('error');
                    errorMessage.textContent = "Error loading stored results.";
                    resultsContainer.appendChild(errorMessage);
                } else {
                    displayStoredResults(items);
                }
            });

            // Listen for the "refreshStoredResults" message from the background script
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === "refreshStoredResults") {
                    console.log("[Popup] Received refresh request, reloading stored results.");
                    chrome.storage.local.get(null, (updatedItems) => {
                        displayStoredResults(updatedItems);
                        // Update the status message only if there are results for the current tab
                        if (activeTabId && updatedItems[activeTabId]) {
                            const result = updatedItems[activeTabId];
                            const successMessage = `Found ${result.count} potential elements. Successfully parsed ${result.count} floats.\nAverage: ${result.average.toFixed(6)}`;
                            console.log(successMessage);
                            calculationInfoContainer.classList.remove('error');
                        } else if (Object.keys(updatedItems).length === 0) {
                            calculationInfoContainer.textContent = "No results stored yet.";
                        } else {
                            calculationInfoContainer.textContent = ""; // Clear if no result for current tab
                        }
                    });
                }
            });

            // Check current tab on popup load
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

                if (["skinport.com", "csfloat.com"].some(domain => hostname === domain || hostname.endsWith("." + domain))) {
                    calculateButton.disabled = false;
                } else {
                    calculateButton.disabled = true;
                }
            }));

            // --- Button click listener ---
            calculateButton.addEventListener("click", (() => {
                if (activeTabId) {
                    calculateButton.disabled = true;
                    calculationInfoContainer.textContent = "Calculating...";

                    chrome.scripting.executeScript({
                        target: { tabId: activeTabId },
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
                            const result = { average: floats.reduce((sum, val) => sum + val, 0) / floats.length, count: floats.length, totalElementsFound };

                            // Send the message from the content script
                            chrome.runtime.sendMessage({
                                action: "storeCalculationResult",
                                average: result.average,
                                count: result.count
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

                        if (result.error) {
                            calculationInfoContainer.textContent = result.error;
                            calculationInfoContainer.classList.add('error');
                        }
                        // The success message will be displayed in the refresh listener
                    });
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
                            displayStoredResults({});
                        }
                    });
                });
            }

        })); // --- End of DOMContentLoaded listener ---

    })(); // --- End of main IIFE ---

})(); // --- End of outer IIFE ---

// Source mapping comment from original file
//# sourceMappingURL=popup.js.map