import type { Settings } from '../types';
import { DEFAULT_PROCESS_TYPES } from '../types';

const SETTINGS_KEY = 'maskinfo_settings';
const SELECTED_TEXT_KEY = 'maskinfo_selected_text';

const DEFAULT_SETTINGS: Settings = {
  processTypes: [...DEFAULT_PROCESS_TYPES], // 預設處理姓名、電話、地址、Email（數值不處理）
};

/**
 * 讀取設定
 */
export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      if (result[SETTINGS_KEY]) {
        resolve(result[SETTINGS_KEY] as Settings);
      } else {
        resolve(DEFAULT_SETTINGS);
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
