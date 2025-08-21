// src/services/responder/processing/textProcessor.js
// Handles text sanitization and cleaning for response processing

/**
 * Small sanitizer to clean PDF noise and normalize text formatting
 * @param {string} text - Raw text to clean
 * @returns {string} Cleaned and normalized text
 */
export function cleanText(text = '') {
  return String(text)
    .replace(/\b(\d{1,3})\s*\|\s*Pa\s*ge\b/gi, '')
    .replace(/\bPage\s+\d+\b/gi, '')
    .replace(/·/g, '•')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n(?!\n)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default { cleanText };