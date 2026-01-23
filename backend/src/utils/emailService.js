const nodemailer = require('nodemailer');
const logger = require('./logger');

// Configuration du transporteur SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'ssl.ovh.net',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Vérifier la connexion au démarrage
transporter.verify((error, success) => {
  if (error) {
    logger.error('Erreur connexion SMTP:', error);
  } else {
    logger.info('Serveur SMTP prêt');
  }
});

// Labels des statuts
const statusLabels = {
  'attente_elements': 'Attente éléments',
  'elements_recus': 'Éléments reçus',
  'ok_pour_maquette': 'OK pour maquette',
  'en_maquette': 'En maquette',
  'maquette_a_valider': 'Maquette à valider',
  'maquette_validee_photogravure': 'Validée photogravure',
  'en_peaufinage': 'En peaufinage',
  'pour_corrections': 'Pour corrections',
  'en_bat': 'En BAT',
  'bat_valide': 'BAT validé',
  'pdf_hd_ok': 'PDF HD OK'
};

/**
 * Envoie une notification de changement de statut
 */
async function sendStatusChangeNotification({ 
  recipientEmail, 
  recipientName,
  projectTitle, 
  pageNumber, 
  fromStatus, 
  toStatus, 
  changedByName,
  changedByRole,
  pageUrl 
}) {
  const fromLabel = statusLabels[fromStatus] || fromStatus;
  const toLabel = statusLabels[toStatus] || toStatus;

  const mailOptions = {
    from: {
      name: 'WeValid - noreply',
      address: 'wevalid@20foislours.fr'
    },
/* replyTo: 'noreply@wevalidrmax.com',*/
    to: recipientEmail,
    subject: `[WeValid] ${projectTitle} - Page ${pageNumber} : ${toLabel}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .status-change { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .status { display: inline-block; padding: 5px 10px; border-radius: 4px; font-weight: bold; }
          .status-from { background: #fee2e2; color: #991b1b; }
          .status-to { background: #dcfce7; color: #166534; }
          .arrow { margin: 0 10px; color: #6b7280; }
          .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>WeValid</h1>
          </div>
          <div class="content">
            <p>Bonjour ${recipientName},</p>
            
            <p>Un changement de statut a été effectué sur le projet <strong>${projectTitle}</strong>.</p>
            
            <div class="status-change">
              <p><strong>Page ${pageNumber}</strong></p>
              <p>
                <span class="status status-from">${fromLabel}</span>
                <span class="arrow">→</span>
                <span class="status status-to">${toLabel}</span>
              </p>
              <p style="color: #6b7280; font-size: 14px; margin-top: 10px;">
                Modifié par ${changedByName} (${changedByRole})
              </p>
            </div>
            
            ${pageUrl ? `<a href="${pageUrl}" class="btn">Voir la page</a>` : ''}
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement par WeValid.</p>
            <p>Merci de ne pas répondre à ce message.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Bonjour ${recipientName},

Un changement de statut a été effectué sur le projet ${projectTitle}.

Page ${pageNumber}
Statut : ${fromLabel} → ${toLabel}
Modifié par : ${changedByName} (${changedByRole})

${pageUrl ? `Voir la page : ${pageUrl}` : ''}

--
Cet email a été envoyé automatiquement par WeValid.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé:', { to: recipientEmail, subject: mailOptions.subject });
    return true;
  } catch (error) {
    logger.error('Erreur envoi email:', { error: error.message, to: recipientEmail });
    return false;
  }
}

module.exports = {
  sendStatusChangeNotification,
  transporter
};
