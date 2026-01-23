const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const logger = require('./logger');

/**
 * Extrait les annotations d'un PDF
 */
async function extractAnnotationsFromPDF(pdfPath) {
  const annotations = [];
  
  try {
    const { stdout } = await execPromise(`strings "${pdfPath}" | tr '\\n' ' '`);
    
    if (!stdout) {
      logger.info('Aucune donnée extraite du PDF');
      return annotations;
    }

    logger.info('Extraction PDF: taille données=' + stdout.length);

    const validTypes = ['Text', 'Highlight', 'Underline', 'StrikeOut', 'Stamp', 'FreeText', 'Ink', 'Square', 'Circle', 'Caret'];
    
    const annotBlocks = stdout.split('/Type/Annot');
    
    for (let i = 0; i < annotBlocks.length - 1; i++) {
      const block = annotBlocks[i];
      
      const lastStart = block.lastIndexOf('<<');
      if (lastStart === -1) continue;
      
      const annotBlock = block.substring(lastStart);
      
      // Extraire le type
      const typeMatch = annotBlock.match(/\/Subtype\/(\w+)/);
      if (!typeMatch) continue;
      
      const type = typeMatch[1];
      if (!validTypes.includes(type)) continue;
      
      // Extraire le contenu - trouver /Contents( et lire jusqu'à la prochaine )/ ou )/
      // On cherche le pattern /Contents(...) où ... ne contient pas de )/
      let content = '';
      const contentsStart = annotBlock.indexOf('/Contents(');
      if (contentsStart !== -1) {
        const startIdx = contentsStart + 10; // après "/Contents("
        let depth = 1;
        let endIdx = startIdx;
        
        // Parcourir pour trouver la parenthèse fermante correspondante
        for (let j = startIdx; j < annotBlock.length && depth > 0; j++) {
          if (annotBlock[j] === '(' && annotBlock[j-1] !== '\\') {
            depth++;
          } else if (annotBlock[j] === ')' && annotBlock[j-1] !== '\\') {
            depth--;
            if (depth === 0) {
              endIdx = j;
              break;
            }
          }
        }
        
        content = annotBlock.substring(startIdx, endIdx);
      }
      
      if (!content) continue;
      
      // Nettoyer : prendre seulement le texte avant les métadonnées PDF
      // Les métadonnées commencent souvent par )/ ou par des patterns comme /CreationDate
      const cleanContent = cleanPDFContent(content);
      
      if (!cleanContent || cleanContent.length === 0) continue;
      
      // Extraire l'auteur
      const authorMatch = annotBlock.match(/\/T\(([^)]+)\)/);
      const author = authorMatch ? authorMatch[1] : 'Acrobat';
      
      // Extraire la position
      const rectMatch = annotBlock.match(/\/Rect\[([^\]]+)\]/);
      let position = { x: 100, y: 100, width: 50, height: 50 };
      if (rectMatch) {
        const coords = rectMatch[1].split(/\s+/).map(parseFloat);
        if (coords.length >= 4) {
          position = {
            x: coords[0],
            y: coords[1],
            width: coords[2] - coords[0],
            height: coords[3] - coords[1]
          };
        }
      }
      
      annotations.push({
        type: mapAcrobatTypeToWevalid(type),
        content: cleanContent,
        author: author,
        position: position,
        color: getColorForType(type),
        source: 'acrobat_import'
      });
      
      logger.info(`Annotation extraite: type=${type}, auteur=${author}, contenu="${cleanContent.substring(0, 50)}"`);
    }
    
    logger.info(`Total annotations extraites: ${annotations.length}`);
    
  } catch (error) {
    logger.error('Erreur extraction annotations PDF:', error);
  }
  
  return annotations;
}

/**
 * Nettoie le contenu d'une annotation PDF
 */
function cleanPDFContent(str) {
  if (!str) return '';
  
  // Couper avant les métadonnées PDF (patterns courants)
  const cutPatterns = [
    /\)\/[A-Z]/,           // )/CreationDate, )/F, etc.
    /\/CreationDate/,
    /\/M\(D:/,
    /\/NM\(/,
    /\/P \d/,
    /\/Popup/,
    /\/QuadPoints/,
    /\/RC\(/,
    /\/Rect\[/,
    /\/Subj\(/,
  ];
  
  let cleaned = str;
  for (const pattern of cutPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined) {
      cleaned = cleaned.substring(0, match.index);
    }
  }
  
  // Nettoyer le HTML et les caractères spéciaux
  cleaned = cleaned
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned;
}

/**
 * Mappe les types Acrobat vers les types WeValid
 */
function mapAcrobatTypeToWevalid(acrobatType) {
  const typeMap = {
    'Text': 'comment',
    'FreeText': 'comment',
    'Highlight': 'highlight',
    'Underline': 'highlight',
    'StrikeOut': 'correction',
    'Stamp': 'validation',
    'Ink': 'comment',
    'Square': 'comment',
    'Circle': 'comment',
    'Caret': 'correction'
  };
  return typeMap[acrobatType] || 'comment';
}

/**
 * Retourne une couleur par défaut selon le type
 */
function getColorForType(type) {
  const colorMap = {
    'Text': '#FFFF00',
    'FreeText': '#FFFF00',
    'Highlight': '#FFFF00',
    'Underline': '#00FF00',
    'StrikeOut': '#FF0000',
    'Stamp': '#00FF00',
    'Ink': '#0000FF',
    'Square': '#FF0000',
    'Circle': '#FF0000',
    'Caret': '#FF0000'
  };
  return colorMap[type] || '#FFFF00';
}

module.exports = {
  extractAnnotationsFromPDF,
  mapAcrobatTypeToWevalid
};
