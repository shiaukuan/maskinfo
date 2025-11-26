/**
 * 數值隨機變動器
 * 對數值進行 ±10-30% 的隨機變動，保持原有格式
 */

/**
 * 隨機變動數值
 */
export function randomizeNumber(value: string): string {
  // 提取數字部分（支援千分位和小數點）
  const numMatch = value.match(/[\d,]+(?:\.\d+)?/);
  if (!numMatch) return value;

  const numStr = numMatch[0];
  const cleanNum = numStr.replace(/,/g, '');
  const num = parseFloat(cleanNum);

  if (isNaN(num) || num === 0) return value;

  // 隨機變動 ±10-30%
  const variance = 0.1 + Math.random() * 0.2; // 10-30%
  const direction = Math.random() > 0.5 ? 1 : -1;
  const newNum = num * (1 + direction * variance);

  // 保持原有格式
  const hasComma = numStr.includes(',');
  const decimalMatch = cleanNum.match(/\.(\d+)$/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;

  let result: string;

  if (decimals > 0) {
    result = newNum.toFixed(decimals);
  } else {
    result = Math.round(newNum).toString();
  }

  // 加入千分位
  if (hasComma) {
    const parts = result.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    result = parts.join('.');
  }

  // 替換原始數字
  return value.replace(numMatch[0], result);
}

/**
 * 批次隨機變動（用於保持同一組數字的變動一致性）
 */
export function createNumberRandomizer() {
  const cache = new Map<string, string>();

  return (value: string): string => {
    // 使用原始數字作為 key
    const numMatch = value.match(/[\d,]+(?:\.\d+)?/);
    if (!numMatch) return value;

    const key = numMatch[0];

    if (!cache.has(key)) {
      cache.set(key, randomizeNumber(value));
    }

    return cache.get(key)!;
  };
}
