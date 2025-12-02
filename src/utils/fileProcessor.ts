import JSZip from 'jszip';
import type { SensitiveType, Settings, FileProcessResult } from '../types';
import { detectSensitiveInfo } from './detector';
import { maskValue } from './masker';
import { randomizeNumber } from './randomizer';

type FileType = 'docx' | 'xlsx' | 'pptx';

interface ProcessStats {
  stats: Record<SensitiveType, number>;
}

/**
 * 判斷檔案類型
 */
function getFileType(filename: string): FileType | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'pptx') return 'pptx';
  return null;
}

/**
 * 對文字進行隱碼處理
 */
function maskText(text: string, processTypes: SensitiveType[]): { masked: string; stats: Record<SensitiveType, number> } {
  const matches = detectSensitiveInfo(text);
  const stats: Record<SensitiveType, number> = {
    name: 0,
    phone: 0,
    address: 0,
    email: 0,
    number: 0,
  };

  if (matches.length === 0) {
    return { masked: text, stats };
  }

  // 從後往前替換，避免位置偏移
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
  let result = text;

  for (const match of sortedMatches) {
    // 只處理勾選的類型
    if (processTypes.includes(match.type)) {
      const masked = match.type === 'number'
        ? randomizeNumber(match.value)
        : maskValue(match.value, match.type);
      result = result.slice(0, match.start) + masked + result.slice(match.end);
      stats[match.type]++;
    }
  }

  return { masked: result, stats };
}

/**
 * 合併統計數據
 */
function mergeStats(target: Record<SensitiveType, number>, source: Record<SensitiveType, number>): void {
  for (const type of Object.keys(source) as SensitiveType[]) {
    target[type] += source[type];
  }
}

/**
 * 處理 XML 中的文字節點
 * 使用正則表達式匹配並替換文字內容
 */
function processXmlContent(xml: string, tagPattern: RegExp, processTypes: SensitiveType[]): { processed: string; stats: Record<SensitiveType, number> } {
  const totalStats: Record<SensitiveType, number> = {
    name: 0,
    phone: 0,
    address: 0,
    email: 0,
    number: 0,
  };

  const processed = xml.replace(tagPattern, (match, prefix, content, suffix) => {
    if (!content || content.trim() === '') {
      return match;
    }
    const { masked, stats } = maskText(content, processTypes);
    mergeStats(totalStats, stats);
    return prefix + masked + suffix;
  });

  return { processed, stats: totalStats };
}

/**
 * 處理 Word 文件 (.docx)
 */
async function processDocx(zip: JSZip, processTypes: SensitiveType[]): Promise<ProcessStats> {
  const totalStats: Record<SensitiveType, number> = {
    name: 0,
    phone: 0,
    address: 0,
    email: 0,
    number: 0,
  };

  // Word 文字節點: <w:t>...</w:t> 或 <w:t xml:space="preserve">...</w:t>
  const textTagPattern = /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g;

  // 處理 document.xml（主要內容）
  const docPath = 'word/document.xml';
  const docFile = zip.file(docPath);
  if (docFile) {
    const content = await docFile.async('string');
    const { processed, stats } = processXmlContent(content, textTagPattern, processTypes);
    zip.file(docPath, processed);
    mergeStats(totalStats, stats);
  }

  // 處理頁首頁尾
  const headerFooterPattern = /word\/(header|footer)\d+\.xml/;
  for (const [path, file] of Object.entries(zip.files)) {
    if (headerFooterPattern.test(path) && !file.dir) {
      const content = await file.async('string');
      const { processed, stats } = processXmlContent(content, textTagPattern, processTypes);
      zip.file(path, processed);
      mergeStats(totalStats, stats);
    }
  }

  return { stats: totalStats };
}

/**
 * 處理 Excel 文件 (.xlsx)
 */
async function processXlsx(zip: JSZip, processTypes: SensitiveType[]): Promise<ProcessStats> {
  const totalStats: Record<SensitiveType, number> = {
    name: 0,
    phone: 0,
    address: 0,
    email: 0,
    number: 0,
  };

  // Excel 共用字串: <t>...</t> 或 <t xml:space="preserve">...</t>
  const textTagPattern = /(<t[^>]*>)([^<]*)(<\/t>)/g;

  // 處理 sharedStrings.xml（共用字串表）
  const sharedStringsPath = 'xl/sharedStrings.xml';
  const sharedStringsFile = zip.file(sharedStringsPath);
  if (sharedStringsFile) {
    const content = await sharedStringsFile.async('string');
    const { processed, stats } = processXmlContent(content, textTagPattern, processTypes);
    zip.file(sharedStringsPath, processed);
    mergeStats(totalStats, stats);
  }

  // 處理各工作表中的內嵌文字（inline strings）
  const sheetPattern = /xl\/worksheets\/sheet\d+\.xml/;
  for (const [path, file] of Object.entries(zip.files)) {
    if (sheetPattern.test(path) && !file.dir) {
      const content = await file.async('string');
      const { processed, stats } = processXmlContent(content, textTagPattern, processTypes);
      zip.file(path, processed);
      mergeStats(totalStats, stats);
    }
  }

  return { stats: totalStats };
}

/**
 * 處理 PowerPoint 文件 (.pptx)
 */
async function processPptx(zip: JSZip, processTypes: SensitiveType[]): Promise<ProcessStats> {
  const totalStats: Record<SensitiveType, number> = {
    name: 0,
    phone: 0,
    address: 0,
    email: 0,
    number: 0,
  };

  // PowerPoint 文字節點: <a:t>...</a:t>
  const textTagPattern = /(<a:t[^>]*>)([^<]*)(<\/a:t>)/g;

  // 處理投影片
  const slidePattern = /ppt\/slides\/slide\d+\.xml/;
  for (const [path, file] of Object.entries(zip.files)) {
    if (slidePattern.test(path) && !file.dir) {
      const content = await file.async('string');
      const { processed, stats } = processXmlContent(content, textTagPattern, processTypes);
      zip.file(path, processed);
      mergeStats(totalStats, stats);
    }
  }

  // 處理投影片版面配置
  const layoutPattern = /ppt\/slideLayouts\/slideLayout\d+\.xml/;
  for (const [path, file] of Object.entries(zip.files)) {
    if (layoutPattern.test(path) && !file.dir) {
      const content = await file.async('string');
      const { processed, stats } = processXmlContent(content, textTagPattern, processTypes);
      zip.file(path, processed);
      mergeStats(totalStats, stats);
    }
  }

  // 處理投影片母片
  const masterPattern = /ppt\/slideMasters\/slideMaster\d+\.xml/;
  for (const [path, file] of Object.entries(zip.files)) {
    if (masterPattern.test(path) && !file.dir) {
      const content = await file.async('string');
      const { processed, stats } = processXmlContent(content, textTagPattern, processTypes);
      zip.file(path, processed);
      mergeStats(totalStats, stats);
    }
  }

  return { stats: totalStats };
}

/**
 * 處理 Office 文件
 */
export async function processOfficeFile(file: File, settings: Settings): Promise<FileProcessResult> {
  const fileType = getFileType(file.name);
  if (!fileType) {
    throw new Error('不支援的檔案格式。請上傳 .docx、.xlsx 或 .pptx 檔案。');
  }

  const processTypes = settings.processTypes || [];

  // 讀取並解壓檔案
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let result: ProcessStats;

  // 根據檔案類型處理
  switch (fileType) {
    case 'docx':
      result = await processDocx(zip, processTypes);
      break;
    case 'xlsx':
      result = await processXlsx(zip, processTypes);
      break;
    case 'pptx':
      result = await processPptx(zip, processTypes);
      break;
  }

  // 重新打包
  const processedBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: getMimeType(fileType),
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // 生成新檔名
  const nameParts = file.name.split('.');
  const ext = nameParts.pop();
  const baseName = nameParts.join('.');
  const newName = `${baseName}_masked.${ext}`;

  return {
    originalName: newName,
    processedBlob,
    stats: result.stats,
  };
}

/**
 * 取得 MIME 類型
 */
function getMimeType(fileType: FileType): string {
  switch (fileType) {
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
}

/**
 * 下載檔案
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
