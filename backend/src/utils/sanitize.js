/**
 * Sanitize filename to only allow: uppercase, lowercase, underscore, numbers
 * No accents, spaces, or special characters (full sanitization)
 */
function sanitizeFilename(filename) {
  if (!filename) return 'file';

  // Get extension
  const lastDot = filename.lastIndexOf('.');
  const name = lastDot > 0 ? filename.substring(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.substring(lastDot) : '';

  // Normalize accents (é -> e, ü -> u, etc.)
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Replace spaces with underscores
  const noSpaces = normalized.replace(/\s+/g, '_');

  // Keep only alphanumeric and underscore
  const sanitized = noSpaces.replace(/[^a-zA-Z0-9_]/g, '');

  // Ensure we have something left
  const finalName = sanitized || 'file';

  // Sanitize extension too (just alphanumeric)
  const sanitizedExt = ext.replace(/[^a-zA-Z0-9.]/g, '');

  return finalName + sanitizedExt;
}

/**
 * Safe filename - only removes dangerous filesystem characters
 * Preserves accents, spaces, and most special characters
 * Only removes: / \ : * ? " < > | and null bytes
 */
function safeFilename(filename) {
  if (!filename) return 'file';

  // Remove dangerous filesystem characters
  const safe = filename.replace(/[/\\:*?"<>|\x00]/g, '_');

  // Collapse multiple underscores
  const collapsed = safe.replace(/_+/g, '_');

  // Trim underscores from start and end
  const trimmed = collapsed.replace(/^_+|_+$/g, '');

  return trimmed || 'file';
}

/**
 * Process filename based on sanitize option
 * @param {string} filename - Original filename
 * @param {boolean} sanitize - If true, full sanitization; if false, only safe filename
 */
function processFilename(filename, sanitize = true) {
  return sanitize ? sanitizeFilename(filename) : safeFilename(filename);
}

module.exports = { sanitizeFilename, safeFilename, processFilename };
