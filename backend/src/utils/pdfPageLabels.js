/**
 * Utilitaires pour extraire les Page Labels des PDFs
 * Les Page Labels sont les numéros de page affichés dans le PDF (peuvent être i, ii, 1, 2, A-1, etc.)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const logger = require('./logger');

/**
 * Extrait les Page Labels d'un PDF en utilisant pdfinfo
 * @param {string} pdfPath - Chemin vers le fichier PDF
 * @returns {Promise<Array<{pdfPage: number, label: string}>>} - Tableau des labels par page
 */
async function extractPageLabels(pdfPath) {
  try {
    // pdfinfo -f 1 -l -1 affiche les infos de toutes les pages
    // Le format inclut les Page Labels si présents
    const { stdout } = await execPromise(`pdfinfo -f 1 -l -1 "${pdfPath}" 2>/dev/null || echo ""`);

    const pageLabels = [];
    const lines = stdout.split('\n');

    // Chercher les lignes "Page X label: Y"
    // Format typique de pdfinfo pour les labels
    let currentPage = 0;

    for (const line of lines) {
      // Chercher "Page X size:" pour compter les pages
      const pageSizeMatch = line.match(/^Page\s+(\d+)\s+size:/i);
      if (pageSizeMatch) {
        currentPage = parseInt(pageSizeMatch[1]);
      }

      // Chercher "Page X label:" pour les labels
      const labelMatch = line.match(/^Page\s+(\d+)\s+label:\s*(.+)$/i);
      if (labelMatch) {
        pageLabels.push({
          pdfPage: parseInt(labelMatch[1]),
          label: labelMatch[2].trim()
        });
      }
    }

    // Si pdfinfo n'a pas retourné de labels, essayer avec pdftk ou qpdf
    if (pageLabels.length === 0) {
      return await extractPageLabelsAlternative(pdfPath);
    }

    return pageLabels;
  } catch (error) {
    logger.warn('Erreur extraction Page Labels avec pdfinfo:', error.message);
    return await extractPageLabelsAlternative(pdfPath);
  }
}

/**
 * Méthode alternative pour extraire les Page Labels
 * Utilise pdftk dump_data ou analyse le PDF directement
 */
async function extractPageLabelsAlternative(pdfPath) {
  try {
    // Essayer avec pdftk
    const { stdout } = await execPromise(`pdftk "${pdfPath}" dump_data 2>/dev/null | grep -E "^PageLabel" || echo ""`);

    const pageLabels = [];
    const lines = stdout.split('\n').filter(l => l.trim());

    // Format pdftk: PageLabelNewIndex: X, PageLabelStart: Y, PageLabelPrefix: Z, PageLabelNumStyle: ...
    let currentConfig = {};

    for (const line of lines) {
      const [key, value] = line.split(':').map(s => s.trim());

      if (key === 'PageLabelNewIndex') {
        if (Object.keys(currentConfig).length > 0) {
          // Sauvegarder la config précédente
        }
        currentConfig = { startIndex: parseInt(value) };
      } else if (key === 'PageLabelStart') {
        currentConfig.startNumber = parseInt(value);
      } else if (key === 'PageLabelPrefix') {
        currentConfig.prefix = value;
      } else if (key === 'PageLabelNumStyle') {
        currentConfig.style = value;
      }
    }

    // Si pas de labels trouvés, retourner tableau vide
    if (pageLabels.length === 0) {
      logger.info('Aucun Page Label trouvé dans le PDF, utilisation des numéros de page standard');
    }

    return pageLabels;
  } catch (error) {
    logger.warn('Erreur extraction Page Labels alternative:', error.message);
    return [];
  }
}

/**
 * Parse un label de page pour extraire le numéro
 * Gère les formats: "1", "i", "ii", "A-1", "Chapitre 1", etc.
 * @param {string} label - Le label de page
 * @returns {number|null} - Le numéro extrait ou null
 */
function parsePageLabel(label) {
  if (!label) return null;

  const trimmed = label.trim();

  // Cas 1: Nombre direct
  const directNumber = parseInt(trimmed);
  if (!isNaN(directNumber) && directNumber > 0) {
    return directNumber;
  }

  // Cas 2: Chiffres romains (i, ii, iii, iv, v, vi, vii, viii, ix, x, etc.)
  const romanNumerals = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
    'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10,
    'xi': 11, 'xii': 12, 'xiii': 13, 'xiv': 14, 'xv': 15,
    'xvi': 16, 'xvii': 17, 'xviii': 18, 'xix': 19, 'xx': 20
  };

  const lowerLabel = trimmed.toLowerCase();
  if (romanNumerals[lowerLabel]) {
    // Les chiffres romains sont généralement pour les pages préliminaires
    // On pourrait les mapper à des numéros négatifs ou les ignorer
    return null; // ou return -romanNumerals[lowerLabel] pour les distinguer
  }

  // Cas 3: Format "Prefix-Number" (ex: "A-1", "Ch1", etc.)
  const prefixMatch = trimmed.match(/[A-Za-z]*[-_]?(\d+)/);
  if (prefixMatch) {
    return parseInt(prefixMatch[1]);
  }

  // Cas 4: Extraire le premier nombre trouvé
  const anyNumber = trimmed.match(/(\d+)/);
  if (anyNumber) {
    return parseInt(anyNumber[1]);
  }

  return null;
}

/**
 * Crée un mapping entre les pages PDF et les pages projet basé sur les labels
 * @param {Array<{pdfPage: number, label: string}>} pageLabels - Labels extraits du PDF
 * @param {Array<{id: number, page_number: number}>} projectPages - Pages du projet
 * @returns {Array<{pdfPage: number, projectPageId: number, projectPageNumber: number}>}
 */
function createPageMapping(pageLabels, projectPages) {
  const mapping = [];

  // Créer un index des pages projet par numéro
  const projectPagesByNumber = {};
  for (const page of projectPages) {
    projectPagesByNumber[page.page_number] = page;
  }

  // Si on a des labels, les utiliser pour le mapping
  if (pageLabels.length > 0) {
    for (const { pdfPage, label } of pageLabels) {
      const pageNumber = parsePageLabel(label);

      if (pageNumber && projectPagesByNumber[pageNumber]) {
        mapping.push({
          pdfPage,
          projectPageId: projectPagesByNumber[pageNumber].id,
          projectPageNumber: pageNumber,
          label
        });
      }
    }
  }

  return mapping;
}

/**
 * Compte le nombre de pages dans un PDF
 */
async function countPDFPages(pdfPath) {
  try {
    const { stdout } = await execPromise(`pdfinfo "${pdfPath}" | grep "^Pages:" | awk '{print $2}'`);
    const pageCount = parseInt(stdout.trim());

    if (isNaN(pageCount) || pageCount <= 0) {
      throw new Error('Nombre de pages invalide');
    }

    return pageCount;
  } catch (error) {
    logger.error('Erreur comptage pages PDF:', error);
    throw new Error('Impossible de compter les pages du PDF');
  }
}

module.exports = {
  extractPageLabels,
  parsePageLabel,
  createPageMapping,
  countPDFPages
};
