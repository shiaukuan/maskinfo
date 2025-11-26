// 建立右鍵選單
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'maskinfo-process',
    title: '隱碼處理選取文字',
    contexts: ['selection'],
  });
});

// 處理右鍵選單點擊
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'maskinfo-process' && info.selectionText) {
    // 儲存選取的文字
    chrome.storage.local.set({
      maskinfo_selected_text: info.selectionText,
    });

    // 開啟 popup
    if (tab?.id) {
      chrome.action.openPopup();
    }
  }
});

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTED_TEXT') {
    chrome.storage.local.get(['maskinfo_selected_text'], (result) => {
      sendResponse({ text: result.maskinfo_selected_text || null });
    });
    return true; // 非同步回應
  }

  if (message.type === 'CLEAR_SELECTED_TEXT') {
    chrome.storage.local.remove(['maskinfo_selected_text']);
    sendResponse({ success: true });
    return true;
  }
});
