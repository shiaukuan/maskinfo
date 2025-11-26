import type { SensitiveType } from '../types';

const MASK_CHAR = '*';

/**
 * 部分遮蔽敏感值
 */
export function maskValue(value: string, type: SensitiveType): string {
  switch (type) {
    case 'email':
      return maskEmail(value);
    case 'phone':
      return maskPhone(value);
    case 'name':
      return maskName(value);
    case 'address':
      return maskAddress(value);
    case 'number':
      // 數值由 randomizer 處理
      return value;
    default:
      return MASK_CHAR.repeat(value.length);
  }
}

/**
 * Email 隱碼：user@domain.com → u***@d***.com
 */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return MASK_CHAR.repeat(email.length);

  const domainParts = domain.split('.');
  const tld = domainParts.pop() || '';
  const domainName = domainParts.join('.');

  const maskedUser = user[0] + MASK_CHAR.repeat(3);
  const maskedDomain = domainName[0] + MASK_CHAR.repeat(3);

  return `${maskedUser}@${maskedDomain}.${tld}`;
}

/**
 * 電話隱碼：0912345678 → 0912***678
 */
function maskPhone(phone: string): string {
  // 移除所有非數字字元
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 7) {
    return MASK_CHAR.repeat(phone.length);
  }

  // 保留前4碼和後3碼
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-3);
  const middleLength = digits.length - 7;

  // 重建格式
  if (phone.includes('-')) {
    return `${prefix}-${MASK_CHAR.repeat(3)}-${suffix}`;
  } else if (phone.includes(' ')) {
    return `${prefix} ${MASK_CHAR.repeat(3)} ${suffix}`;
  }

  return prefix + MASK_CHAR.repeat(middleLength) + suffix;
}

/**
 * 姓名隱碼：
 * - 中文：王大明 → 王**
 * - 英文：John Doe → J*** D**
 */
function maskName(name: string): string {
  // 檢查是否為中文
  const isChinese = /[\u4e00-\u9fa5]/.test(name);

  if (isChinese) {
    // 移除稱謂
    const cleanName = name.replace(/(?:先生|小姐|女士|經理|主任|老師|醫師|律師|教授|董事長|總經理)$/, '');
    const title = name.slice(cleanName.length);

    // 保留姓氏
    if (cleanName.length <= 1) {
      return cleanName + title;
    }
    return cleanName[0] + MASK_CHAR.repeat(cleanName.length - 1) + title;
  }

  // 英文姓名
  return name.split(' ')
    .map(word => word[0] + MASK_CHAR.repeat(Math.min(3, word.length - 1)))
    .join(' ');
}

/**
 * 地址隱碼：台北市大安區XX路1號 → 台北市大安區*****
 */
function maskAddress(address: string): string {
  // 嘗試保留行政區
  const match = address.match(/^([\u4e00-\u9fa5]{2,3}[市縣][\u4e00-\u9fa5]{1,4}[區鄉鎮市])/);

  if (match) {
    const prefix = match[1];
    const remaining = address.slice(prefix.length);
    return prefix + MASK_CHAR.repeat(Math.min(5, remaining.length));
  }

  // 英文地址：保留街道類型
  const streetMatch = address.match(/(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\.?$/i);
  if (streetMatch) {
    return MASK_CHAR.repeat(5) + ' ' + streetMatch[0];
  }

  return MASK_CHAR.repeat(Math.min(10, address.length));
}
