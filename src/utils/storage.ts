import type { Settings } from '../types';
import { DEFAULT_PROCESS_TYPES } from '../types';

const SETTINGS_KEY = 'maskinfo_settings';
const SELECTED_TEXT_KEY = 'maskinfo_selected_text';

/**
 * 讀取設定
 */
export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      const saved = result[SETTINGS_KEY];
      // 確保 processTypes 存在（處理舊版設定格式）
      if (saved && Array.isArray(saved.processTypes)) {
        resolve(saved as Settings);
      } else {
        // 舊版或無設定，使用預設值
        resolve({ processTypes: [...DEFAULT_PROCESS_TYPES] });
      }
    });
  });
}

/**
 * 儲存設定
 */
export async function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, resolve);
  });
}


/**
 * 儲存選取的文字
 */
export async function saveSelectedText(text: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SELECTED_TEXT_KEY]: text }, resolve);
  });
}

/**
 * 讀取選取的文字
 */
export async function getSelectedText(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([SELECTED_TEXT_KEY], (result) => {
      resolve(result[SELECTED_TEXT_KEY] || null);
    });
  });
}

/**
 * 清除選取的文字
 */
export async function clearSelectedText(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([SELECTED_TEXT_KEY], resolve);
  });
}
