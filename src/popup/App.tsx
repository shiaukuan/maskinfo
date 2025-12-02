import { useEffect, useState, useCallback, useRef } from 'react';
import type { ProcessResult, SensitiveType, Settings, SensitiveMatch, FileProcessResult } from '../types';
import { SENSITIVE_TYPE_LABELS, DEFAULT_PROCESS_TYPES } from '../types';
import { processText, rebuildText } from '../utils/detector';
import { getSettings, saveSettings } from '../utils/storage';
import { processOfficeFile, downloadFile } from '../utils/fileProcessor';

type Mode = 'text' | 'file';

export default function App() {
  const [mode, setMode] = useState<Mode>('text');
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [settings, setSettings] = useState<Settings>({ processTypes: [...DEFAULT_PROCESS_TYPES] });
  const [copied, setCopied] = useState(false);
  const [inputText, setInputText] = useState('');

  // 檔案處理狀態
  const [fileResult, setFileResult] = useState<FileProcessResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 載入選取的文字和設定
  useEffect(() => {
    const init = async () => {
      // 載入設定
      const savedSettings = await getSettings();
      // 確保 processTypes 存在
      const processTypes = savedSettings.processTypes || [...DEFAULT_PROCESS_TYPES];
      const validSettings = { processTypes };
      setSettings(validSettings);

      // 嘗試取得選取的文字
      chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' }, (response) => {
        if (response?.text) {
          const processed = processText(response.text);
          // 套用設定：打勾的類型要處理（隱碼），所以 visible = false
          processed.matches.forEach((match: SensitiveMatch) => {
            match.visible = !processTypes.includes(match.type);
          });
          setResult(processed);
        }
      });
    };

    init();
  }, []);

  // 切換類型處理狀態（打勾 = 處理/隱碼）
  const toggleType = useCallback(async (type: SensitiveType) => {
    const currentTypes = settings.processTypes || [];
    const newProcessTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];

    const newSettings = { ...settings, processTypes: newProcessTypes };
    setSettings(newSettings);
    await saveSettings(newSettings);

    if (result) {
      // 打勾 = 處理（隱碼），所以 visible = false
      const updatedMatches = result.matches.map((match) => ({
        ...match,
        visible: !newProcessTypes.includes(match.type),
      }));
      setResult({ ...result, matches: updatedMatches });
    }
  }, [settings, result]);

  // 取得顯示文字
  const getDisplayText = useCallback(() => {
    if (!result) return '';
    return rebuildText(result.original, result.matches);
  }, [result]);

  // 複製到剪貼簿（確保 Windows 換行符格式，Excel 相容）
  const copyToClipboard = useCallback(async () => {
    let text = getDisplayText();
    // 統一換行符為 \r\n（Windows/Excel 格式）
    text = text.replace(/\r?\n/g, '\r\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getDisplayText]);

  // 處理輸入的文字
  const handleProcess = useCallback(() => {
    if (!inputText.trim()) return;
    const processed = processText(inputText);
    const currentTypes = settings.processTypes || [];
    // 套用設定：打勾的類型要處理（隱碼），所以 visible = false
    processed.matches.forEach((match: SensitiveMatch) => {
      match.visible = !currentTypes.includes(match.type);
    });
    setResult(processed);
  }, [inputText, settings.processTypes]);

  // 清除結果
  const handleClear = useCallback(() => {
    setResult(null);
    setInputText('');
    setFileResult(null);
    setError(null);
    chrome.runtime.sendMessage({ type: 'CLEAR_SELECTED_TEXT' });
  }, []);

  // 統計摘要
  const getStatsSummary = (stats: Record<SensitiveType, number>) => {
    const items = Object.entries(stats)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${SENSITIVE_TYPE_LABELS[type as SensitiveType]}: ${count}`)
      .join('、');
    return items || '未偵測到敏感資訊';
  };

  // 處理檔案上傳
  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);
    setFileResult(null);
    setProcessing(true);

    try {
      const result = await processOfficeFile(file, settings);
      setFileResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '處理檔案時發生錯誤');
    } finally {
      setProcessing(false);
    }
  }, [settings]);

  // 檔案輸入變更
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // 清空 input，允許重複上傳同一檔案
    e.target.value = '';
  }, [handleFileUpload]);

  // 拖放處理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // 下載處理後的檔案
  const handleDownload = useCallback(() => {
    if (fileResult) {
      downloadFile(fileResult.processedBlob, fileResult.originalName);
    }
  }, [fileResult]);

  // 切換模式
  const switchMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    setResult(null);
    setFileResult(null);
    setError(null);
    setInputText('');
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>MaskInfo</h1>
        <span className="subtitle">敏感資訊隱碼工具</span>
      </header>

      {/* 模式切換 */}
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'text' ? 'active' : ''}`}
          onClick={() => switchMode('text')}
        >
          文字輸入
        </button>
        <button
          className={`mode-tab ${mode === 'file' ? 'active' : ''}`}
          onClick={() => switchMode('file')}
        >
          檔案上傳
        </button>
      </div>

      {/* 類型切換（共用） */}
      <div className="type-toggles">
        {(Object.keys(SENSITIVE_TYPE_LABELS) as SensitiveType[]).map((type) => (
          <label key={type} className="toggle-item">
            <input
              type="checkbox"
              checked={(settings.processTypes || []).includes(type)}
              onChange={() => toggleType(type)}
            />
            <span className="toggle-label">
              {SENSITIVE_TYPE_LABELS[type]}
            </span>
          </label>
        ))}
      </div>

      {/* 文字模式 */}
      {mode === 'text' && (
        <>
          {/* 輸入區域 */}
          {!result && (
            <div className="input-section">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="貼上或輸入要處理的文字..."
                rows={5}
              />
              <button className="btn btn-primary" onClick={handleProcess} disabled={!inputText.trim()}>
                處理文字
              </button>
            </div>
          )}

          {/* 結果區域 */}
          {result && (
            <>
              {/* 統計資訊 */}
              <div className="stats">
                {getStatsSummary(result.stats)}
              </div>

              {/* 結果顯示 */}
              <div className="result">
                <pre>{getDisplayText()}</pre>
              </div>

              {/* 操作按鈕 */}
              <div className="actions">
                <button className="btn btn-primary" onClick={copyToClipboard}>
                  {copied ? '已複製！' : '複製結果'}
                </button>
                <button className="btn btn-secondary" onClick={handleClear}>
                  清除
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* 檔案模式 */}
      {mode === 'file' && (
        <>
          {/* 上傳區域 */}
          {!fileResult && !processing && (
            <div
              className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.xlsx,.pptx"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              <div className="upload-icon">📄</div>
              <div className="upload-text">
                點擊或拖放檔案到這裡
              </div>
              <div className="upload-hint">
                支援 .docx、.xlsx、.pptx
              </div>
            </div>
          )}

          {/* 處理中 */}
          {processing && (
            <div className="processing">
              <div className="spinner"></div>
              <div>處理中...</div>
            </div>
          )}

          {/* 錯誤訊息 */}
          {error && (
            <div className="error-message">
              {error}
              <button className="btn btn-secondary" onClick={handleClear} style={{ marginTop: '12px' }}>
                重試
              </button>
            </div>
          )}

          {/* 檔案處理結果 */}
          {fileResult && (
            <>
              <div className="stats">
                {getStatsSummary(fileResult.stats)}
              </div>

              <div className="file-result">
                <div className="file-info">
                  <span className="file-icon">✅</span>
                  <span className="file-name">{fileResult.originalName}</span>
                </div>
                <div className="file-note">
                  檔案已在本地端處理完成，所有敏感資訊已隱碼
                </div>
              </div>

              <div className="actions">
                <button className="btn btn-primary" onClick={handleDownload}>
                  下載處理後檔案
                </button>
                <button className="btn btn-secondary" onClick={handleClear}>
                  處理其他檔案
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
