/******/ (() => { // webpackBootstrap
    "use strict";
    /************************************************************************/


})()
;

chrome.runtime.onInstalled.addListener(() => {
    console.log("Skin Float Calculator extension installed.");
});

async function getTabTitle(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        let title = tab.title;
        try {
            const url = new URL(tab.url);
            const hostname = url.hostname;
            if (hostname.includes("skinport.com")) {
                title = "Skinport";
            } else if (hostname.includes("csfloat.com")) {
                title = "CSFloat";
            }
        } catch (error) {
            console.error("Error parsing URL:", error);
            // Fallback to the full title if URL parsing fails
        }
        return title;
    } catch (error) {
        console.error("Error getting tab title:", error);
        return `Tab ${tabId}`; // Fallback
    }
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "storeCalculationResult") {
        const tabId = sender.tab.id;
        const average = request.average;
        const count = request.count;

        const title = await getTabTitle(tabId);

        const data = {
            average: average,
            count: count,
            timestamp: Date.now(),
            title: title
        };
        const storageKey = String(tabId);
        const storageData = {};
        storageData[storageKey] = data;

        console.log(`[Background] Attempting to store data for tab ${tabId} (${title}):`, storageData);

        await chrome.storage.local.set(storageData, () => {
            if (chrome.runtime.lastError) {
                console.error("[Background] Error saving data to storage:", chrome.runtime.lastError);
                // Optionally send an error back to the content script/popup
            } else {
                console.log("[Background] Data saved successfully for tab:", tabId);
                // Send a message back to the popup to refresh the displayed results
                chrome.runtime.sendMessage({ action: "refreshStoredResults" });
            }
        });
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.storage.local.remove(String(tabId), () => {
        if (chrome.runtime.lastError) {
            console.error(`[Background] Error removing data for tab ${tabId}:`, chrome.runtime.lastError);
        } else {
            console.log(`[Background] Data removed for closed tab: ${tabId}`);
        }
    });
});