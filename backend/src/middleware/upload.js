const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { processFilename } = require('../utils/sanitize');

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/app/storage/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    // Check query param for sanitize option (default: true)
    const shouldSanitize = req.query.sanitize_filename !== 'false';
    const processed = processFilename(file.originalname, shouldSanitize);
    cb(null, `${Date.now()}-${uniqueSuffix}_${processed}`);
  }
});

// Filtrage des types de fichiers
const fileFilter = (req, file, cb) => {
  // Types autorisés
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 
    'image/tiff', 'image/bmp', 'image/x-photoshop', 'image/vnd.adobe.photoshop',
    // PDF
    'application/pdf',
    // Documents texte
    'text/plain', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf',
    // Autres
    'application/zip', 'application/x-rar-compressed'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
  }
};

// Configuration multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: Infinity // pas de limite
  }
});

module.exports = upload;