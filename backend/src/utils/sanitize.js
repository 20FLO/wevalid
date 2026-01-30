/**
 * Sanitize filename to only allow: uppercase, lowercase, underscore, numbers
 * No accents, spaces, or special characters
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

module.exports = { sanitizeFilename };
