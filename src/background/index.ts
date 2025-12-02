// 建立右鍵選單
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'maskinfo-process',
    title: '隱碼處理選取文字',
    contexts: ['selection'],
  });
});

/**
 * 在頁面中執行的函數：取得選取的表格文字並保留格式
 */
function getFormattedSelection(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return '';
  }

  const range = selection.getRangeAt(0);

  // 檢查是否在表格內
  function isInsideTable(node: Node): HTMLTableElement | null {
    let current: Node | null = node;
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE && (current as Element).tagName === 'TABLE') {
        return current as HTMLTableElement;
      }
      current = current.parentNode;
    }
    return null;
  }

  const startTable = isInsideTable(range.startContainer);
  const endTable = isInsideTable(range.endContainer);

  // 如果選取範圍在同一個表格內
  if (startTable && startTable === endTable) {
    const rows = startTable.querySelectorAll('tr');
    const result: string[] = [];

    rows.forEach((row) => {
      if (selection.containsNode(row, true)) {
        const cells = row.querySelectorAll('td, th');
        const cellTexts: string[] = [];

        cells.forEach((cell) => {
          if (selection.containsNode(cell, true)) {
            cellTexts.push(cell.textContent?.trim() || '');
          }
        });

        if (cellTexts.length > 0) {
          result.push(cellTexts.join('\t'));
        }
      }
    });

    if (result.length > 0) {
      return result.join('\n');
    }
  }

  // 嘗試從 HTML 片段處理
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());

  // 處理 <tr> 標籤
  const rows = container.querySelectorAll('tr');
  if (rows.length > 0) {
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length > 0) {
        const cellTexts: string[] = [];
        cells.forEach((cell) => {
          cellTexts.push(cell.textContent?.trim() || '');
        });
        row.innerHTML = cellTexts.join('\t');
      }
      row.insertAdjacentText('afterend', '\n');
    });

    let text = container.textContent || '';
    text = text.replace(/\t+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text) return text;
  }

  // 處理區塊元素
  const blockElements = container.querySelectorAll('p, div, li, br, h1, h2, h3, h4, h5, h6');
  blockElements.forEach((el) => {
    el.insertAdjacentText('afterend', '\n');
  });

  let text = container.textContent || '';
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text || selection.toString();
}

// 處理右鍵選單點擊
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'maskinfo-process' && tab?.id) {
    let text = info.selectionText || '';

    // 使用 scripting API 動態注入腳本取得格式化的文字
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getFormattedSelection,
      });

      if (results && results[0] && results[0].result) {
        text = results[0].result;
      }
    } catch (err) {
      console.log('Failed to execute script, using selectionText:', err);
    }

    if (text) {
      // 儲存選取的文字
      chrome.storage.local.set({
        maskinfo_selected_text: text,
      });

      // 開啟 popup
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
    return true;
  }

  if (message.type === 'CLEAR_SELECTED_TEXT') {
    chrome.storage.local.remove(['maskinfo_selected_text']);
    sendResponse({ success: true });
    return true;
  }
});
