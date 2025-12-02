export type SensitiveType = 'name' | 'phone' | 'address' | 'email' | 'number';

export interface SensitiveMatch {
  id: string;
  type: SensitiveType;
  value: string;        // 原始值
  masked: string;       // 隱碼後的值
  start: number;        // 在原文中的起始位置
  end: number;          // 在原文中的結束位置
  visible: boolean;     // 是否顯示原始值
}

export interface ProcessResult {
  original: string;
  matches: SensitiveMatch[];
  stats: Record<SensitiveType, number>;
}

export interface Settings {
  processTypes: SensitiveType[];  // 要處理（隱碼）的類型，打勾 = 處理
}

// 預設處理的類型（數值預設不處理）
export const DEFAULT_PROCESS_TYPES: SensitiveType[] = ['name', 'phone', 'address', 'email'];

export const SENSITIVE_TYPE_LABELS: Record<SensitiveType, string> = {
  name: '姓名',
  phone: '電話',
  address: '地址',
  email: 'Email',
  number: '數值',
};

export interface FileProcessResult {
  originalName: string;
  processedBlob: Blob;
  stats: Record<SensitiveType, number>;
}
