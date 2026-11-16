import { format } from 'date-fns';

export const getSiteDisplayName = (item: any) => {
  if (item?.siteName) return item.siteName;
  if (!item?.url) return 'RESOURCE';
  try {
    const url = new URL(item.url);
    const domain = url.hostname.replace('www.', '').split('.')[0];
    return domain.toUpperCase();
  } catch {
    return 'RESOURCE';
  }
};

export const getCleanUrlDisplay = (urlStr?: string, maxLen: number = 40): string => {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr);
    const clean = `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    if (clean.length > maxLen) {
      return clean.slice(0, maxLen) + '…';
    }
    return clean;
  } catch {
    if (urlStr.length > maxLen) {
      return urlStr.slice(0, maxLen) + '…';
    }
    return urlStr;
  }
};

/**
 * Safely formats any Firestore Timestamp, JS Date, or ISO string.
 */
export const formatItemDate = (rawDate: any, formatStr: string = 'MMM d, yyyy'): string => {
  if (!rawDate) return '—';
  try {
    // Firestore Timestamp with toDate()
    if (typeof rawDate.toDate === 'function') {
      return format(rawDate.toDate(), formatStr);
    }
    // Firestore Timestamp-like { seconds, nanoseconds }
    if (typeof rawDate.seconds === 'number') {
      return format(new Date(rawDate.seconds * 1000), formatStr);
    }
    // JS Date instance
    if (rawDate instanceof Date) {
      return isNaN(rawDate.getTime()) ? '—' : format(rawDate, formatStr);
    }
    // ISO string or timestamp number
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      return format(parsed, formatStr);
    }
    return '—';
  } catch {
    return '—';
  }
};

/**
 * Detailed timestamp with hour & minute for modals/detail views
 */
export const formatItemDateTime = (rawDate: any): string => {
  return formatItemDate(rawDate, 'MMM d, yyyy · h:mm a');
};
