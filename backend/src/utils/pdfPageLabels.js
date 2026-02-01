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
 * Méthode alternative pour extraire les Page Labels avec qpdf
 * Lit directement les objets PageLabels du PDF et génère un label pour chaque page
 */
async function extractPageLabelsAlternative(pdfPath) {
  try {
    // D'abord, compter le nombre de pages du PDF
    let totalPages = 1;
    try {
      const { stdout: npages } = await execPromise(`qpdf --show-npages "${pdfPath}" 2>/dev/null`);
      totalPages = parseInt(npages.trim()) || 1;
    } catch (e) {
      logger.warn('Impossible de compter les pages avec qpdf:', e.message);
    }

    // Étape 1: Trouver l'objet PageLabels dans le catalogue
    const { stdout: catalogOutput } = await execPromise(`qpdf --show-object=1 "${pdfPath}" 2>/dev/null || echo ""`);

    // Chercher la référence PageLabels (ex: /PageLabels 6 0 R)
    let pageLabelRefMatch = catalogOutput.match(/\/PageLabels\s+(\d+)\s+0\s+R/);
    if (!pageLabelRefMatch) {
      // Essayer de chercher dans tout le PDF
      const { stdout: stringsOutput } = await execPromise(`strings "${pdfPath}" | grep -o "/PageLabels [0-9]* 0 R" | head -1`);
      const altMatch = stringsOutput.match(/\/PageLabels\s+(\d+)\s+0\s+R/);
      if (!altMatch) {
        logger.info('Aucun objet PageLabels trouvé dans le PDF');
        return [];
      }
      pageLabelRefMatch = altMatch;
    }

    const pageLabelObjNum = pageLabelRefMatch[1];
    logger.info(`Objet PageLabels trouvé: ${pageLabelObjNum}`);

    // Étape 2: Lire l'objet PageLabels pour obtenir le tableau Nums
    const { stdout: pageLabelObj } = await execPromise(`qpdf --show-object=${pageLabelObjNum} "${pdfPath}" 2>/dev/null`);

    // Format: << /Nums [ 0 7 0 R ] >> ou << /Nums [ 0 << /S /D /St 7 >> ] >>
    const numsMatch = pageLabelObj.match(/\/Nums\s*\[\s*(.+)\s*\]/s);
    if (!numsMatch) {
      logger.info('Pas de tableau Nums dans PageLabels');
      return [];
    }

    const numsContent = numsMatch[1].trim();

    // Collecter les configurations de labels (peuvent être multiples pour différentes sections)
    const labelConfigs = [];

    // Parser le tableau Nums - peut contenir des références ou des dictionnaires inline
    // Format: pageIndex objRef 0 R ou pageIndex << /S /D /St N >>
    const refMatches = [...numsContent.matchAll(/(\d+)\s+(\d+)\s+0\s+R/g)];

    for (const match of refMatches) {
      const pageIndex = parseInt(match[1]);
      const labelObjNum = match[2];

      // Lire l'objet label
      const { stdout: labelObj } = await execPromise(`qpdf --show-object=${labelObjNum} "${pdfPath}" 2>/dev/null`);

      // Extraire /St (start number)
      const stMatch = labelObj.match(/\/St\s+(\d+)/);
      const prefixMatch = labelObj.match(/\/P\s*\(([^)]*)\)/);
      const styleMatch = labelObj.match(/\/S\s+\/([A-Za-z]+)/);

      if (stMatch) {
        const startNumber = parseInt(stMatch[1]);
        const prefix = prefixMatch ? prefixMatch[1] : '';
        const style = styleMatch ? styleMatch[1] : 'D';

        logger.info(`Config trouvée - pageIndex=${pageIndex}, start=${startNumber}, prefix="${prefix}", style=${style}`);

        labelConfigs.push({
          pageIndex: pageIndex, // 0-indexed
          startNumber: startNumber,
          prefix: prefix,
          style: style
        });
      }
    }

    // Aussi chercher les dictionnaires inline << /S /D /St N >>
    const inlineMatches = [...numsContent.matchAll(/(\d+)\s*<<([^>]+)>>/g)];
    for (const inlineMatch of inlineMatches) {
      const pageIndex = parseInt(inlineMatch[1]);
      const dictContent = inlineMatch[2];

      const stMatch = dictContent.match(/\/St\s+(\d+)/);
      const prefixMatch = dictContent.match(/\/P\s*\(([^)]*)\)/);
      const styleMatch = dictContent.match(/\/S\s+\/([A-Za-z]+)/);

      if (stMatch) {
        const startNumber = parseInt(stMatch[1]);
        const prefix = prefixMatch ? prefixMatch[1] : '';
        const style = styleMatch ? styleMatch[1] : 'D';

        logger.info(`Config inline trouvée - pageIndex=${pageIndex}, start=${startNumber}, prefix="${prefix}"`);

        labelConfigs.push({
          pageIndex: pageIndex,
          startNumber: startNumber,
          prefix: prefix,
          style: style
        });
      }
    }

    if (labelConfigs.length === 0) {
      logger.info('Aucun Page Label trouvé dans le PDF');
      return [];
    }

    // Trier les configs par pageIndex
    labelConfigs.sort((a, b) => a.pageIndex - b.pageIndex);

    // Générer un label pour chaque page du PDF
    const pageLabels = [];
    for (let pdfPageIndex = 0; pdfPageIndex < totalPages; pdfPageIndex++) {
      // Trouver la config applicable (la dernière avec pageIndex <= pdfPageIndex)
      let applicableConfig = null;
      for (const config of labelConfigs) {
        if (config.pageIndex <= pdfPageIndex) {
          applicableConfig = config;
        } else {
          break;
        }
      }

      if (applicableConfig) {
        // Calculer le numéro de page: startNumber + (pdfPageIndex - pageIndex de la config)
        const pageNumber = applicableConfig.startNumber + (pdfPageIndex - applicableConfig.pageIndex);
        const label = applicableConfig.prefix + pageNumber.toString();

        pageLabels.push({
          pdfPage: pdfPageIndex + 1, // pdfPage est 1-indexed
          label: label,
          startNumber: pageNumber
        });
      }
    }

    logger.info(`${pageLabels.length} Page Labels générés pour ${totalPages} pages`);
    return pageLabels;
  } catch (error) {
    logger.warn('Erreur extraction Page Labels avec qpdf:', error.message);
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
 * @param {Array<{pdfPage: number, label: string, startNumber?: number}>} pageLabels - Labels extraits du PDF
 * @param {Array<{id: number, page_number: number}>} projectPages - Pages du projet
 * @param {number} totalPdfPages - Nombre total de pages dans le PDF
 * @returns {Array<{pdfPage: number, projectPageId: number, projectPageNumber: number}>}
 */
function createPageMapping(pageLabels, projectPages, totalPdfPages = 1) {
  const mapping = [];

  // Créer un index des pages projet par numéro
  const projectPagesByNumber = {};
  for (const page of projectPages) {
    projectPagesByNumber[page.page_number] = page;
  }

  // Si on a des labels, les utiliser pour le mapping
  if (pageLabels.length > 0) {
    // Trier les labels par pdfPage
    const sortedLabels = [...pageLabels].sort((a, b) => a.pdfPage - b.pdfPage);

    // Pour chaque page du PDF, déterminer son numéro de page projet
    for (let pdfPage = 1; pdfPage <= totalPdfPages; pdfPage++) {
      // Trouver le label applicable (le dernier label avec pdfPage <= page courante)
      let applicableLabel = null;
      for (const label of sortedLabels) {
        if (label.pdfPage <= pdfPage) {
          applicableLabel = label;
        } else {
          break;
        }
      }

      if (applicableLabel) {
        // Calculer le numéro de page: startNumber + (pdfPage - pdfPage du label)
        const pageNumber = applicableLabel.startNumber
          ? applicableLabel.startNumber + (pdfPage - applicableLabel.pdfPage)
          : parsePageLabel(applicableLabel.label);

        if (pageNumber && projectPagesByNumber[pageNumber]) {
          mapping.push({
            pdfPage,
            projectPageId: projectPagesByNumber[pageNumber].id,
            projectPageNumber: pageNumber,
            label: applicableLabel.label
          });
        }
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
    // Essayer avec pdfinfo d'abord
    const { stdout } = await execPromise(`pdfinfo "${pdfPath}" 2>/dev/null | grep "^Pages:" | awk '{print $2}'`);
    const pageCount = parseInt(stdout.trim());

    if (!isNaN(pageCount) && pageCount > 0) {
      return pageCount;
    }

    // Fallback avec qpdf
    const { stdout: qpdfOut } = await execPromise(`qpdf --show-npages "${pdfPath}" 2>/dev/null`);
    const qpdfCount = parseInt(qpdfOut.trim());

    if (!isNaN(qpdfCount) && qpdfCount > 0) {
      return qpdfCount;
    }

    throw new Error('Nombre de pages invalide');
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
