const Joi = require('joi');
const logger = require('../utils/logger');

// Middleware générique de validation
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Validation échouée:', { errors });

      return res.status(400).json({
        error: {
          message: 'Données invalides',
          details: errors
        }
      });
    }

    req.validatedBody = value;
    next();
  };
}

// Schémas de validation communs
const schemas = {
  // Authentification
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required()
  }),

  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    first_name: Joi.string().min(2).max(50).required(),
    last_name: Joi.string().min(2).max(50).required(),
    role: Joi.string().valid('admin', 'auteur', 'editeur', 'photograveur', 'fabricant', 'graphiste').required()
  }),

  // Projet
  createProject: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    isbn: Joi.string().pattern(/^[0-9-]{10,17}$/).allow('', null),
    description: Joi.string().max(1000).allow('', null),
    total_pages: Joi.number().integer().min(1).max(10000).required(),
    publisher_id: Joi.number().integer().allow(null),
    width_mm: Joi.number().integer().min(50).max(1000).allow(null),
    height_mm: Joi.number().integer().min(50).max(1000).allow(null)
  }),

  updateProject: Joi.object({
    title: Joi.string().min(1).max(200),
    isbn: Joi.string().pattern(/^[0-9-]{10,17}$/).allow('', null),
    description: Joi.string().max(1000).allow('', null),
    total_pages: Joi.number().integer().min(1).max(10000),
    publisher_id: Joi.number().integer().allow(null),
    width_mm: Joi.number().integer().min(50).max(1000).allow(null),
    height_mm: Joi.number().integer().min(50).max(1000).allow(null),
    status: Joi.string().valid('draft', 'in_progress', 'bat', 'completed', 'archived')
  }),

  // Publisher (Maison d'édition)
  createPublisher: Joi.object({
    name: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(1000).allow('', null)
  }),

  updatePublisher: Joi.object({
    name: Joi.string().min(1).max(200),
    description: Joi.string().max(1000).allow('', null)
  }),

  // Page - Statuts mis à jour
  updatePageStatus: Joi.object({
    status: Joi.string().valid(
      'attente_elements',
      'elements_recus',
      'ok_pour_maquette',
      'en_maquette',
      'maquette_a_valider',
      'maquette_validee_photogravure',
      'en_peaufinage',
      'pour_corrections',
      'en_bat',
      'bat_valide',
      'pdf_hd_ok'
    ).required()
  }),

  // Annotation
  createAnnotation: Joi.object({
    page_id: Joi.number().integer().required(),
    type: Joi.string().valid('comment', 'highlight', 'drawing', 'stamp').required(),
    content: Joi.string().max(5000).required(),
    position: Joi.object({
      x: Joi.number().required(),
      y: Joi.number().required(),
      width: Joi.number(),
      height: Joi.number(),
      page_number: Joi.number().integer().required()
    }).required(),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).default('#FFFF00')
  })
};

module.exports = { validate, schemas };
