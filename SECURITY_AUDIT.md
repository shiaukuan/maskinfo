# MaskInfo 安全性分析報告

## 摘要

**結論：本應用完全在本地端運算，不會將任何資料傳送到雲端或外部伺服器。**

---

## 1. 專案依賴分析

### 生產環境依賴 (dependencies)

| 套件 | 版本 | 用途 | 安全性 |
|------|------|------|--------|
| react | ^18.2.0 | UI 框架 | 安全 - Meta 官方維護 |
| react-dom | ^18.2.0 | React DOM 渲染 | 安全 - Meta 官方維護 |
| jszip | ^3.10.1 | 本地端 ZIP 處理 | 安全 - 純本地運算，無網路功能 |

### 開發環境依賴 (devDependencies)

| 套件 | 版本 | 用途 |
|------|------|------|
| @crxjs/vite-plugin | ^2.0.0-beta.23 | Chrome 擴展構建工具 |
| @types/chrome | ^0.0.260 | TypeScript 類型定義 |
| @types/react | ^18.2.0 | TypeScript 類型定義 |
| @types/react-dom | ^18.2.0 | TypeScript 類型定義 |
| @vitejs/plugin-react | ^4.2.0 | Vite React 插件 |
| typescript | ^5.3.0 | TypeScript 編譯器 |
| vite | ^5.0.0 | 構建工具 |

> 開發依賴不會包含在最終的擴展產品中。

---

## 2. Chrome 擴展權限分析

### 已請求的權限

```json
"permissions": ["contextMenus", "storage", "activeTab", "scripting"]
```

| 權限 | 用途 | 風險等級 |
|------|------|----------|
| `contextMenus` | 建立右鍵選單「隱碼處理選取文字」 | 低 - 僅 UI 功能 |
| `storage` | 儲存用戶設定到本地 | 低 - 僅本地儲存 |
| `activeTab` | 存取當前標籤頁以取得選取文字 | 低 - 僅限用戶主動觸發 |
| `scripting` | 動態執行腳本取得選取文字 | 低 - 僅在用戶點擊右鍵選單時觸發 |

### 未請求的高風險權限

本擴展**沒有**請求以下危險權限：

- `<all_urls>` - 無法存取所有網站
- `webRequest` / `webRequestBlocking` - 無法攔截或修改網路請求
- `tabs` - 無法存取所有標籤頁資訊
- `cookies` - 無法存取 Cookie
- `history` - 無法存取瀏覽歷史
- `downloads` - 無法管理下載（檔案下載使用標準 DOM API）

---

## 3. 網路請求分析

### 原始碼搜尋結果

對所有原始碼檔案進行搜尋，**未發現**任何網路相關 API：

| API | 搜尋結果 |
|-----|----------|
| `fetch(` | 未找到 |
| `XMLHttpRequest` | 未找到 |
| `WebSocket` | 未找到 |
| `navigator.sendBeacon` | 未找到 |
| `new Image().src` | 未找到 |
| 外部 URL | 未找到 |

### 結論

**本擴展不進行任何網路請求，所有處理都在本地端完成。**

---

## 4. 資料流分析

### 4.1 文字輸入模式

```
用戶輸入文字
    ↓
processText() [src/utils/detector.ts]
    ↓
detectSensitiveInfo() - 使用正則表達式偵測敏感資訊
    ↓
maskValue() [src/utils/masker.ts] - 本地字串處理
    ↓
顯示結果於 popup
    ↓
navigator.clipboard.writeText() - 複製到剪貼簿（本地）
```

### 4.2 網頁選取模式

```
用戶在網頁選取文字 → 右鍵選單
    ↓
chrome.scripting.executeScript() - 在頁面中執行腳本取得選取文字
    ↓
chrome.storage.local.set() - 暫存到本地儲存
    ↓
popup 從 chrome.storage.local 讀取
    ↓
本地處理並顯示結果
```

### 4.3 檔案上傳模式

```
用戶選擇 .docx/.xlsx/.pptx 檔案
    ↓
File API - file.arrayBuffer() 讀取檔案到記憶體
    ↓
JSZip.loadAsync() - 本地解壓 ZIP
    ↓
處理 XML 內容中的文字 - 純字串操作
    ↓
JSZip.generateAsync() - 重新打包
    ↓
URL.createObjectURL() + <a download> - 本地下載
    ↓
URL.revokeObjectURL() - 釋放記憶體
```

**所有資料流都在瀏覽器本地端完成，沒有任何資料外傳。**

---

## 5. 本地儲存分析

### 使用的儲存項目

| Key | 用途 | 內容 |
|-----|------|------|
| `maskinfo_settings` | 用戶偏好設定 | 勾選的隱碼類型（name, phone, address, email, number） |
| `maskinfo_selected_text` | 暫存選取文字 | 用戶選取的原始文字，處理完畢後清除 |

### 儲存位置

使用 `chrome.storage.local`，資料儲存於：
- Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Extension Settings\<extension-id>/`
- 完全在用戶電腦本地，不會同步到雲端

---

## 6. 檔案處理安全性

### Office 文件處理流程

1. **讀取**：使用 File API 讀取檔案到 ArrayBuffer（記憶體）
2. **解壓**：使用 JSZip 在本地解壓（Office 文件是 ZIP 格式）
3. **處理**：使用正則表達式處理 XML 中的文字節點
4. **打包**：使用 JSZip 重新壓縮
5. **下載**：使用 Blob + createObjectURL 觸發本地下載

### 安全特點

- 檔案從未離開用戶電腦
- 不使用任何外部服務
- 不上傳到任何伺服器
- 處理完成後 Blob URL 立即釋放

---

## 7. 原始碼審計結果

### 檔案清單

| 檔案 | 功能 | 網路活動 |
|------|------|----------|
| `src/background/index.ts` | 右鍵選單、訊息處理 | 無 |
| `src/popup/App.tsx` | 主要 UI | 無 |
| `src/utils/detector.ts` | 敏感資訊偵測 | 無 |
| `src/utils/masker.ts` | 隱碼處理 | 無 |
| `src/utils/randomizer.ts` | 數值隨機化 | 無 |
| `src/utils/storage.ts` | 本地儲存 | 無 |
| `src/utils/fileProcessor.ts` | Office 文件處理 | 無 |
| `src/types/index.ts` | TypeScript 類型定義 | 無 |

### 使用的 Chrome API

| API | 用途 | 資料外傳風險 |
|-----|------|--------------|
| `chrome.contextMenus` | 建立右鍵選單 | 無 |
| `chrome.storage.local` | 本地儲存 | 無 |
| `chrome.runtime.sendMessage` | 擴展內部通訊 | 無 |
| `chrome.runtime.onMessage` | 監聽內部訊息 | 無 |
| `chrome.scripting.executeScript` | 執行腳本取得選取文字 | 無 |
| `chrome.action.openPopup` | 開啟 popup | 無 |

---

## 8. 安全性總結

### 安全保證

1. **完全本地端處理** - 所有敏感資訊的偵測和隱碼都在瀏覽器本地完成
2. **無網路通訊** - 不進行任何 HTTP/HTTPS/WebSocket 請求
3. **無外部依賴** - 不調用任何第三方 API 或雲端服務
4. **最小權限原則** - 只請求必要的 Chrome 擴展權限
5. **資料不持久化** - 處理完畢後可清除暫存資料
6. **開源可審計** - 所有原始碼可供檢視

### 風險評估

| 項目 | 評估 |
|------|------|
| 資料外洩風險 | 無 |
| 網路攻擊風險 | 無 |
| 隱私侵犯風險 | 無 |
| 惡意程式碼 | 未發現 |

---

## 9. 驗證方式

用戶可自行驗證本擴展的安全性：

### 方法一：網路監控

1. 開啟 Chrome DevTools (F12)
2. 切換到 Network 標籤
3. 使用擴展處理敏感資訊
4. 確認沒有任何網路請求

### 方法二：原始碼審計

1. 檢視 `src/` 目錄下所有 `.ts` 和 `.tsx` 檔案
2. 搜尋 `fetch`、`XMLHttpRequest`、`WebSocket` 等關鍵字
3. 確認沒有任何網路相關程式碼

### 方法三：權限檢查

1. 前往 `chrome://extensions/`
2. 點擊 MaskInfo 的「詳細資訊」
3. 檢視「權限」區塊
4. 確認沒有「讀取和變更您在所有網站上的資料」等高風險權限

---

## 報告資訊

- **審計日期**：2025 年
- **審計版本**：1.0.0
- **審計範圍**：所有原始碼檔案、依賴套件、Chrome 擴展權限
