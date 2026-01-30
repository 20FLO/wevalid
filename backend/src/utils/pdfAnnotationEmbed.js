const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const logger = require('./logger');

/**
 * Parse color string to RGB values (0-1 range)
 */
function parseColor(colorString) {
  if (!colorString) return { r: 1, g: 1, b: 0 }; // Default yellow

  // Handle hex colors
  if (colorString.startsWith('#')) {
    const hex = colorString.slice(1);
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    return { r, g, b };
  }

  // Default yellow for highlights
  return { r: 1, g: 1, b: 0 };
}

/**
 * Embed annotations into a PDF file
 * @param {string} pdfPath - Path to the original PDF
 * @param {Array} annotations - Array of annotation objects
 * @returns {Buffer} - PDF buffer with embedded annotations
 */
async function embedAnnotationsInPDF(pdfPath, annotations) {
  try {
    // Read the original PDF
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Get the font for text annotations
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages = pdfDoc.getPages();

    for (const annotation of annotations) {
      // Parse position
      let position = annotation.position;
      if (typeof position === 'string') {
        try {
          position = JSON.parse(position);
        } catch {
          continue;
        }
      }

      if (!position) continue;

      // Determine which page (default to first)
      const pageIndex = (position.page_number || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Convert percentage positions to PDF coordinates
      // Note: PDF coordinates start from bottom-left, but our positions are from top-left
      const x = (position.x / 100) * pageWidth;
      const y = pageHeight - ((position.y / 100) * pageHeight);

      const color = parseColor(annotation.color);

      if (annotation.type === 'highlight' && position.width && position.height) {
        // Draw highlight rectangle
        const width = (position.width / 100) * pageWidth;
        const height = (position.height / 100) * pageHeight;

        page.drawRectangle({
          x: x,
          y: y - height,
          width: width,
          height: height,
          color: rgb(color.r, color.g, color.b),
          opacity: 0.3,
        });

        // Add small label if there's content
        if (annotation.content && annotation.content.length < 100) {
          page.drawText(annotation.content, {
            x: x,
            y: y - height - 12,
            size: 8,
            font: font,
            color: rgb(0.3, 0.3, 0.3),
            maxWidth: width,
          });
        }

      } else if (annotation.type === 'ink' && position.ink_path) {
        // Draw ink annotation (freehand drawing)
        // Parse SVG path and convert to PDF operations
        const pathCommands = parseSVGPath(position.ink_path);

        if (pathCommands.length > 1) {
          // Scale factor from canvas to PDF coordinates
          // Assuming canvas was at scale 1 with page dimensions
          const scaleX = pageWidth / 612; // Standard PDF width assumption
          const scaleY = pageHeight / 792; // Standard PDF height assumption

          for (let i = 1; i < pathCommands.length; i++) {
            const prev = pathCommands[i - 1];
            const curr = pathCommands[i];

            // Convert coordinates and flip Y axis
            const x1 = prev.x * scaleX;
            const y1 = pageHeight - (prev.y * scaleY);
            const x2 = curr.x * scaleX;
            const y2 = pageHeight - (curr.y * scaleY);

            page.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              thickness: 2,
              color: rgb(color.r, color.g, color.b),
              opacity: 0.8,
            });
          }
        }

      } else if (annotation.type === 'comment' || annotation.type === 'correction' || annotation.type === 'validation') {
        // Draw comment marker (circle with number)
        const markerSize = 16;

        // Draw circle background
        page.drawCircle({
          x: x,
          y: y,
          size: markerSize,
          color: annotation.resolved ? rgb(0.2, 0.7, 0.2) : rgb(0.9, 0.2, 0.2),
          opacity: 0.9,
        });

        // Draw border
        page.drawCircle({
          x: x,
          y: y,
          size: markerSize,
          borderColor: rgb(1, 1, 1),
          borderWidth: 2,
        });

        // Draw number or checkmark
        const label = annotation.resolved ? '✓' : String(annotation.marker_number || annotation.id);
        const textWidth = font.widthOfTextAtSize(label, 10);

        page.drawText(label, {
          x: x - textWidth / 2,
          y: y - 4,
          size: 10,
          font: boldFont,
          color: rgb(1, 1, 1),
        });

        // Draw content box near the marker if content exists
        if (annotation.content && !annotation.resolved) {
          const boxX = x + markerSize + 5;
          const boxY = y - 10;
          const padding = 4;
          const maxWidth = 200;

          // Truncate long content
          let displayContent = annotation.content;
          if (displayContent.length > 100) {
            displayContent = displayContent.substring(0, 97) + '...';
          }

          const textSize = 8;
          const lines = wrapText(displayContent, font, textSize, maxWidth - padding * 2);
          const boxHeight = lines.length * (textSize + 2) + padding * 2;
          const boxWidth = Math.min(maxWidth, Math.max(...lines.map(l => font.widthOfTextAtSize(l, textSize))) + padding * 2);

          // Draw background
          page.drawRectangle({
            x: boxX,
            y: boxY - boxHeight,
            width: boxWidth,
            height: boxHeight,
            color: rgb(1, 1, 0.9),
            opacity: 0.95,
            borderColor: rgb(0.8, 0.8, 0.2),
            borderWidth: 1,
          });

          // Draw text lines
          lines.forEach((line, i) => {
            page.drawText(line, {
              x: boxX + padding,
              y: boxY - padding - (i + 1) * (textSize + 2) + textSize,
              size: textSize,
              font: font,
              color: rgb(0, 0, 0),
            });
          });
        }
      }
    }

    // Save the modified PDF
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);

  } catch (error) {
    logger.error('Error embedding annotations in PDF:', error);
    throw error;
  }
}

/**
 * Parse SVG path string into array of points
 */
function parseSVGPath(pathString) {
  const points = [];
  const commands = pathString.match(/[ML]\s*[\d.]+\s+[\d.]+/g) || [];

  for (const cmd of commands) {
    const parts = cmd.trim().split(/\s+/);
    if (parts.length >= 3) {
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

/**
 * Wrap text to fit within a maximum width
 */
function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

module.exports = {
  embedAnnotationsInPDF,
  parseColor,
};
