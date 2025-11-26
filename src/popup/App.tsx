import { useEffect, useState, useCallback } from 'react';
import type { ProcessResult, SensitiveType, Settings, SensitiveMatch } from '../types';
import { SENSITIVE_TYPE_LABELS, DEFAULT_PROCESS_TYPES } from '../types';
import { processText, rebuildText } from '../utils/detector';
import { getSettings, saveSettings } from '../utils/storage';

export default function App() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [settings, setSettings] = useState<Settings>({ processTypes: [...DEFAULT_PROCESS_TYPES] });
  const [copied, setCopied] = useState(false);
  const [inputText, setInputText] = useState('');

  // 載入選取的文字和設定
  useEffect(() => {
    const init = async () => {
      // 載入設定
      const savedSettings = await getSettings();
      setSettings(savedSettings);

      // 嘗試取得選取的文字
      chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' }, (response) => {
        if (response?.text) {
          const processed = processText(response.text);
          // 套用設定：打勾的類型要處理（隱碼），所以 visible = false
          processed.matches.forEach((match: SensitiveMatch) => {
            match.visible = !savedSettings.processTypes.includes(match.type);
          });
          setResult(processed);
        }
      });
    };

    init();
  }, []);

  // 切換類型處理狀態（打勾 = 處理/隱碼）
  const toggleType = useCallback(async (type: SensitiveType) => {
    const newProcessTypes = settings.processTypes.includes(type)
      ? settings.processTypes.filter((t) => t !== type)
      : [...settings.processTypes, type];

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

  // 複製到剪貼簿
  const copyToClipboard = useCallback(async () => {
    const text = getDisplayText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getDisplayText]);

  // 處理輸入的文字
  const handleProcess = useCallback(() => {
    if (!inputText.trim()) return;
    const processed = processText(inputText);
    // 套用設定：打勾的類型要處理（隱碼），所以 visible = false
    processed.matches.forEach((match: SensitiveMatch) => {
      match.visible = !settings.processTypes.includes(match.type);
    });
    setResult(processed);
  }, [inputText, settings.processTypes]);

  // 清除結果
  const handleClear = useCallback(() => {
    setResult(null);
    setInputText('');
    chrome.runtime.sendMessage({ type: 'CLEAR_SELECTED_TEXT' });
  }, []);

  // 統計摘要
  const getStatsSummary = () => {
    if (!result) return '';
    const items = Object.entries(result.stats)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${SENSITIVE_TYPE_LABELS[type as SensitiveType]}: ${count}`)
      .join('、');
    return items || '未偵測到敏感資訊';
  };

  return (
    <div className="app">
      <header className="header">
        <h1>MaskInfo</h1>
        <span className="subtitle">敏感資訊隱碼工具</span>
      </header>

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
            {getStatsSummary()}
          </div>

          {/* 類型切換：打勾 = 處理（隱碼） */}
          <div className="type-toggles">
            {(Object.keys(SENSITIVE_TYPE_LABELS) as SensitiveType[]).map((type) => (
              <label key={type} className="toggle-item">
                <input
                  type="checkbox"
                  checked={settings.processTypes.includes(type)}
                  onChange={() => toggleType(type)}
                />
                <span className="toggle-label">
                  {SENSITIVE_TYPE_LABELS[type]}
                  {result.stats[type] > 0 && (
                    <span className="count">({result.stats[type]})</span>
                  )}
                </span>
              </label>
            ))}
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
    </div>
  );
}
