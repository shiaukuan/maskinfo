import type { SensitiveMatch, SensitiveType, ProcessResult } from '../types';
import { maskValue } from './masker';
import { randomizeNumber } from './randomizer';

// 常見中文姓氏
const COMMON_SURNAMES = new Set([
  '陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊',
  '許', '鄭', '謝', '郭', '洪', '邱', '曾', '廖', '賴', '徐',
  '周', '葉', '蘇', '莊', '呂', '江', '何', '蕭', '羅', '高',
  '潘', '簡', '朱', '鍾', '彭', '游', '詹', '胡', '施', '沈',
  '余', '盧', '梁', '趙', '顏', '柯', '翁', '魏', '孫', '戴',
]);

interface PatternConfig {
  type: SensitiveType;
  patterns: RegExp[];
  validator?: (match: string) => boolean;
}

// 偵測模式配置
const DETECTION_PATTERNS: PatternConfig[] = [
  // Email - 最精確，優先偵測
  {
    type: 'email',
    patterns: [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    ],
  },
  // 電話號碼
  {
    type: 'phone',
    patterns: [
      // 台灣手機：0912-345-678 或 0912345678
      /09\d{2}[-\s]?\d{3}[-\s]?\d{3}/g,
      // 台灣市話：02-1234-5678 或 (02)12345678
      /\(?0[2-9]\)?[-\s]?\d{3,4}[-\s]?\d{4}/g,
      // 國際格式：+886-912-345-678
      /\+\d{1,3}[-\s]?\d{2,4}[-\s]?\d{3,4}[-\s]?\d{3,4}/g,
      // 美國格式：(123) 456-7890
      /\(\d{3}\)\s?\d{3}[-\s]?\d{4}/g,
    ],
  },
  // 地址
  {
    type: 'address',
    patterns: [
      // 台灣地址：XX市XX區XX路XX號
      /[\u4e00-\u9fa5]{2,3}[市縣][\u4e00-\u9fa5]{1,4}[區鄉鎮市][\u4e00-\u9fa5]{1,20}[路街道巷弄]\d{1,5}[號樓之\-\d]*/g,
      // 簡化地址：XX路XX號
      /[\u4e00-\u9fa5]{2,15}[路街道]\d{1,5}[號]/g,
      // 英文地址：123 Main Street
      /\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\.?/gi,
    ],
  },
  // 中文姓名（帶稱謂）
  {
    type: 'name',
    patterns: [
      /[\u4e00-\u9fa5]{2,4}(?:先生|小姐|女士|經理|主任|老師|醫師|律師|教授|董事長|總經理)/g,
    ],
    validator: (match: string) => {
      const name = match.replace(/(?:先生|小姐|女士|經理|主任|老師|醫師|律師|教授|董事長|總經理)$/, '');
      return COMMON_SURNAMES.has(name[0]);
    },
  },
  // 中文姓名（純姓名：常見姓氏開頭 + 2-4個字）
  {
    type: 'name',
    patterns: [
      /[\u4e00-\u9fa5]{2,4}/g,
    ],
    validator: (match: string) => {
      // 必須是常見姓氏開頭
      if (!COMMON_SURNAMES.has(match[0])) return false;
      // 排除常見非姓名詞（地名、機構名等）
      const excludeWords = [
        '台北', '台中', '台南', '高雄', '新北', '桃園', '台灣',
        '中國', '日本', '美國', '公司', '銀行', '醫院', '學校',
        '大學', '中心', '政府', '警察', '消防', '郵局', '機場',
      ];
      return !excludeWords.some(word => match.includes(word));
    },
  },
  // 英文姓名
  {
    type: 'name',
    patterns: [
      // 連續的大寫開頭單字（2-3個）
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    ],
    validator: (match: string) => {
      // 排除常見非姓名詞組
      const excludeWords = ['The', 'This', 'That', 'New', 'Old', 'Big', 'Small', 'Main', 'First', 'Last'];
      const words = match.split(' ');
      return !excludeWords.includes(words[0]) && words.length >= 2;
    },
  },
  // 數值（金額、編號等）
  {
    type: 'number',
    patterns: [
      // 金額：$1,234.56 或 NT$1,234
      /(?:NT\$|\$|USD|TWD)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
      // 中文金額：1,234元
      /\d{1,3}(?:,\d{3})*\s?(?:元|萬|億)/g,
      // 連續數字（4位以上）
      /\b\d{4,}\b/g,
    ],
  },
];

let idCounter = 0;

function generateId(): string {
  return `match-${Date.now()}-${++idCounter}`;
}

// 檢查範圍是否重疊
function isOverlapping(start: number, end: number, usedRanges: [number, number][]): boolean {
  return usedRanges.some(([s, e]) => !(end <= s || start >= e));
}

/**
 * 偵測文字中的敏感資訊
 */
export function detectSensitiveInfo(text: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  const usedRanges: [number, number][] = [];

  // 按配置順序偵測（Email 優先）
  for (const config of DETECTION_PATTERNS) {
    for (const pattern of config.patterns) {
      // 重置正則表達式
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[0];
        const start = match.index;
        const end = start + value.length;

        // 檢查是否與已匹配範圍重疊
        if (isOverlapping(start, end, usedRanges)) {
          continue;
        }

        // 執行驗證器（如果有）
        if (config.validator && !config.validator(value)) {
          continue;
        }

        // 計算隱碼值
        const masked = config.type === 'number'
          ? randomizeNumber(value)
          : maskValue(value, config.type);

        matches.push({
          id: generateId(),
          type: config.type,
          value,
          masked,
          start,
          end,
          visible: false,
        });

        usedRanges.push([start, end]);
      }
    }
  }

  // 按位置排序
  return matches.sort((a, b) => a.start - b.start);
}

/**
 * 處理文字並回傳結果
 */
export function processText(text: string): ProcessResult {
  const matches = detectSensitiveInfo(text);

  // 計算統計
  const stats: Record<SensitiveType, number> = {
    name: 0,
    phone: 0,
    address: 0,
    email: 0,
    number: 0,
  };

  for (const match of matches) {
    stats[match.type]++;
  }

  return {
    original: text,
    matches,
    stats,
  };
}

/**
 * 根據 matches 重建文字
 */
export function rebuildText(original: string, matches: SensitiveMatch[]): string {
  if (matches.length === 0) return original;

  // 從後往前替換，避免位置偏移
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
  let result = original;

  for (const match of sortedMatches) {
    const replacement = match.visible ? match.value : match.masked;
    result = result.slice(0, match.start) + replacement + result.slice(match.end);
  }

  return result;
}
