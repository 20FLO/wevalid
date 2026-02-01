const nodemailer = require('nodemailer');
const logger = require('./logger');

// Configuration du transporteur SMTP OVH
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
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

// Configuration expéditeur
const FROM_EMAIL = {
  name: 'WeValid',
  address: process.env.SMTP_USER || 'postmaster@wevalid.fr'
};

// URL de base du frontend
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://wevalid.fr';

// Template de base pour tous les emails
function getEmailTemplate(content, footerText = '') {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WeValid</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
          background-color: #f5f5f5;
        }
        .wrapper { padding: 40px 20px; }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
        }
        .header {
          background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%);
          padding: 32px 40px;
          text-align: center;
        }
        .logo {
          font-size: 28px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.5px;
        }
        .logo span { color: #3b82f6; }
        .content { padding: 40px; }
        .greeting {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 20px;
          color: #1a1a1a;
        }
        .message {
          font-size: 15px;
          color: #4a4a4a;
          margin-bottom: 24px;
        }
        .card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
          margin: 24px 0;
        }
        .card-title {
          font-size: 14px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
        }
        .card-content {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
        }
        .card-detail {
          font-size: 14px;
          color: #6b7280;
          margin-top: 8px;
        }
        .status-badge {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }
        .status-from { background: #fef2f2; color: #dc2626; }
        .status-to { background: #ecfdf5; color: #059669; }
        .status-arrow { margin: 0 12px; color: #9ca3af; }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%);
          color: #ffffff !important;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          margin-top: 8px;
          transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.9; }
        .btn-secondary {
          background: #ffffff;
          color: #1a1a1a !important;
          border: 2px solid #e5e7eb;
        }
        .mention-highlight {
          background: #dbeafe;
          color: #1d4ed8;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }
        .comment-box {
          background: #ffffff;
          border-left: 4px solid #3b82f6;
          padding: 16px 20px;
          margin: 20px 0;
          border-radius: 0 8px 8px 0;
        }
        .comment-author {
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 6px;
        }
        .comment-text {
          color: #4a4a4a;
          font-size: 14px;
        }
        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 32px 0;
        }
        .footer {
          padding: 24px 40px;
          background: #f9fafb;
          text-align: center;
          border-top: 1px solid #e5e7eb;
        }
        .footer-text {
          font-size: 13px;
          color: #9ca3af;
          margin-bottom: 8px;
        }
        .footer-link {
          color: #6b7280;
          text-decoration: none;
        }
        .footer-link:hover { text-decoration: underline; }
        .members-list {
          margin: 16px 0;
        }
        .member-item {
          display: flex;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .member-item:last-child { border-bottom: none; }
        .member-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
          margin-right: 12px;
        }
        .member-info {
          flex: 1;
        }
        .member-name {
          font-weight: 600;
          color: #1a1a1a;
          font-size: 14px;
        }
        .member-role {
          color: #6b7280;
          font-size: 12px;
        }
        .icon {
          display: inline-block;
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #ecfdf5;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon-success { background: #ecfdf5; color: #059669; }
        .icon-info { background: #dbeafe; color: #3b82f6; }
        .icon-warning { background: #fef3c7; color: #d97706; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <div class="logo">We<span>Valid</span></div>
          </div>
          ${content}
          <div class="footer">
            <p class="footer-text">Cet email a été envoyé automatiquement par WeValid.</p>
            <p class="footer-text">
              <a href="${FRONTEND_URL}" class="footer-link">Accéder à WeValid</a>
            </p>
            ${footerText ? `<p class="footer-text" style="margin-top: 12px;">${footerText}</p>` : ''}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

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

// Labels des rôles
const roleLabels = {
  'admin': 'Administrateur',
  'chef_projet': 'Chef de projet',
  'graphiste': 'Graphiste',
  'client': 'Client',
  'lecteur': 'Lecteur'
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
  const roleLabel = roleLabels[changedByRole] || changedByRole;

  const content = `
    <div class="content">
      <p class="greeting">Bonjour ${recipientName},</p>

      <p class="message">Un changement de statut a été effectué sur un projet auquel vous participez.</p>

      <div class="card">
        <div class="card-title">Projet</div>
        <div class="card-content">${projectTitle}</div>
        <div class="card-detail">Page ${pageNumber}</div>
      </div>

      <div class="card">
        <div class="card-title">Changement de statut</div>
        <div style="margin-top: 12px;">
          <span class="status-badge status-from">${fromLabel}</span>
          <span class="status-arrow">→</span>
          <span class="status-badge status-to">${toLabel}</span>
        </div>
        <div class="card-detail" style="margin-top: 16px;">
          Modifié par ${changedByName} (${roleLabel})
        </div>
      </div>

      ${pageUrl ? `<a href="${pageUrl}" class="btn">Voir la page</a>` : ''}
    </div>
  `;

  const mailOptions = {
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `[WeValid] ${projectTitle} - Page ${pageNumber} : ${toLabel}`,
    html: getEmailTemplate(content),
    text: `
Bonjour ${recipientName},

Un changement de statut a été effectué sur le projet ${projectTitle}.

Page ${pageNumber}
Statut : ${fromLabel} → ${toLabel}
Modifié par : ${changedByName} (${roleLabel})

${pageUrl ? `Voir la page : ${pageUrl}` : ''}

--
Cet email a été envoyé automatiquement par WeValid.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé:', { to: recipientEmail, type: 'status_change' });
    return true;
  } catch (error) {
    logger.error('Erreur envoi email:', { error: error.message, to: recipientEmail });
    return false;
  }
}

/**
 * Envoie une notification d'ajout à un projet
 */
async function sendProjectInvitationNotification({
  recipientEmail,
  recipientName,
  projectTitle,
  invitedByName,
  role,
  projectUrl,
  members = []
}) {
  const roleLabel = roleLabels[role] || role;

  const membersList = members.slice(0, 5).map(member => {
    const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase();
    const memberRole = roleLabels[member.role] || member.role;
    return `
      <div class="member-item">
        <div class="member-avatar">${initials}</div>
        <div class="member-info">
          <div class="member-name">${member.first_name} ${member.last_name}</div>
          <div class="member-role">${memberRole}</div>
        </div>
      </div>
    `;
  }).join('');

  const content = `
    <div class="content">
      <p class="greeting">Bonjour ${recipientName},</p>

      <p class="message">Vous avez été ajouté(e) à un nouveau projet sur WeValid par <strong>${invitedByName}</strong>.</p>

      <div class="card">
        <div class="card-title">Projet</div>
        <div class="card-content">${projectTitle}</div>
        <div class="card-detail">Votre rôle : ${roleLabel}</div>
      </div>

      ${members.length > 0 ? `
        <div class="card">
          <div class="card-title">Équipe du projet</div>
          <div class="members-list">
            ${membersList}
          </div>
          ${members.length > 5 ? `<div class="card-detail">Et ${members.length - 5} autres membres...</div>` : ''}
        </div>
      ` : ''}

      <a href="${projectUrl}" class="btn">Accéder au projet</a>
    </div>
  `;

  const mailOptions = {
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `[WeValid] Vous avez été ajouté au projet "${projectTitle}"`,
    html: getEmailTemplate(content),
    text: `
Bonjour ${recipientName},

Vous avez été ajouté(e) au projet "${projectTitle}" sur WeValid par ${invitedByName}.

Votre rôle : ${roleLabel}

Accéder au projet : ${projectUrl}

--
Cet email a été envoyé automatiquement par WeValid.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé:', { to: recipientEmail, type: 'project_invitation' });
    return true;
  } catch (error) {
    logger.error('Erreur envoi email:', { error: error.message, to: recipientEmail });
    return false;
  }
}

/**
 * Envoie une notification quand un PDF est prêt après traitement
 */
async function sendPdfReadyNotification({
  recipientEmail,
  recipientName,
  projectTitle,
  pageNumber,
  uploadedByName,
  pageUrl
}) {
  const content = `
    <div class="content">
      <div style="text-align: center; margin-bottom: 24px;">
        <div class="icon icon-success" style="margin: 0 auto; display: flex;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
        </div>
      </div>

      <p class="greeting">Bonjour ${recipientName},</p>

      <p class="message">Votre PDF a été traité avec succès et est maintenant disponible sur WeValid.</p>

      <div class="card">
        <div class="card-title">Document prêt</div>
        <div class="card-content">${projectTitle}</div>
        <div class="card-detail">Page ${pageNumber}</div>
      </div>

      <p class="message" style="font-size: 14px; color: #6b7280;">
        Le document a été analysé et les numéros de page ont été automatiquement détectés.
        Vous pouvez maintenant consulter, annoter et valider cette page.
      </p>

      <a href="${pageUrl}" class="btn">Voir le document</a>
    </div>
  `;

  const mailOptions = {
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `[WeValid] Votre PDF est prêt - ${projectTitle} (Page ${pageNumber})`,
    html: getEmailTemplate(content),
    text: `
Bonjour ${recipientName},

Votre PDF a été traité avec succès et est maintenant disponible sur WeValid.

Projet : ${projectTitle}
Page : ${pageNumber}

Voir le document : ${pageUrl}

--
Cet email a été envoyé automatiquement par WeValid.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé:', { to: recipientEmail, type: 'pdf_ready' });
    return true;
  } catch (error) {
    logger.error('Erreur envoi email:', { error: error.message, to: recipientEmail });
    return false;
  }
}

/**
 * Envoie une notification quand quelqu'un est mentionné dans un commentaire
 */
async function sendMentionNotification({
  recipientEmail,
  recipientName,
  mentionedByName,
  mentionedByRole,
  projectTitle,
  pageNumber,
  commentText,
  pageUrl
}) {
  const roleLabel = roleLabels[mentionedByRole] || mentionedByRole;

  // Mettre en évidence les mentions dans le texte
  const highlightedComment = commentText.replace(
    /@([A-Za-zÀ-ÿ\s]+)/g,
    '<span class="mention-highlight">@$1</span>'
  );

  const content = `
    <div class="content">
      <p class="greeting">Bonjour ${recipientName},</p>

      <p class="message">
        <strong>${mentionedByName}</strong> vous a mentionné(e) dans un commentaire.
      </p>

      <div class="card">
        <div class="card-title">Projet</div>
        <div class="card-content">${projectTitle}</div>
        <div class="card-detail">Page ${pageNumber}</div>
      </div>

      <div class="comment-box">
        <div class="comment-author">${mentionedByName} <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(${roleLabel})</span></div>
        <div class="comment-text">${highlightedComment}</div>
      </div>

      <a href="${pageUrl}" class="btn">Voir le commentaire</a>
    </div>
  `;

  const mailOptions = {
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `[WeValid] ${mentionedByName} vous a mentionné - ${projectTitle}`,
    html: getEmailTemplate(content),
    text: `
Bonjour ${recipientName},

${mentionedByName} vous a mentionné(e) dans un commentaire sur le projet ${projectTitle}.

Page : ${pageNumber}

Commentaire :
"${commentText}"

Voir le commentaire : ${pageUrl}

--
Cet email a été envoyé automatiquement par WeValid.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé:', { to: recipientEmail, type: 'mention' });
    return true;
  } catch (error) {
    logger.error('Erreur envoi email:', { error: error.message, to: recipientEmail });
    return false;
  }
}

/**
 * Envoie une notification de nouveau commentaire
 */
async function sendCommentNotification({
  recipientEmail,
  recipientName,
  commentByName,
  commentByRole,
  projectTitle,
  pageNumber,
  commentText,
  isReply = false,
  pageUrl
}) {
  const roleLabel = roleLabels[commentByRole] || commentByRole;
  const actionText = isReply ? 'a répondu à un commentaire' : 'a ajouté un commentaire';

  const content = `
    <div class="content">
      <p class="greeting">Bonjour ${recipientName},</p>

      <p class="message">
        <strong>${commentByName}</strong> ${actionText} sur une page que vous suivez.
      </p>

      <div class="card">
        <div class="card-title">Projet</div>
        <div class="card-content">${projectTitle}</div>
        <div class="card-detail">Page ${pageNumber}</div>
      </div>

      <div class="comment-box">
        <div class="comment-author">${commentByName} <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(${roleLabel})</span></div>
        <div class="comment-text">${commentText}</div>
      </div>

      <a href="${pageUrl}" class="btn">Voir le commentaire</a>
    </div>
  `;

  const mailOptions = {
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `[WeValid] Nouveau ${isReply ? 'réponse' : 'commentaire'} - ${projectTitle} (Page ${pageNumber})`,
    html: getEmailTemplate(content),
    text: `
Bonjour ${recipientName},

${commentByName} ${actionText} sur le projet ${projectTitle}.

Page : ${pageNumber}

Commentaire :
"${commentText}"

Voir le commentaire : ${pageUrl}

--
Cet email a été envoyé automatiquement par WeValid.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé:', { to: recipientEmail, type: 'comment' });
    return true;
  } catch (error) {
    logger.error('Erreur envoi email:', { error: error.message, to: recipientEmail });
    return false;
  }
}

/**
 * Envoie un email de bienvenue à un nouvel utilisateur
 */
async function sendWelcomeEmail({
  recipientEmail,
  recipientName,
  temporaryPassword,
  loginUrl
}) {
  const content = `
    <div class="content">
      <div style="text-align: center; margin-bottom: 24px;">
        <div class="icon icon-info" style="margin: 0 auto; display: flex;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      </div>

      <p class="greeting">Bienvenue sur WeValid, ${recipientName} !</p>

      <p class="message">
        Votre compte a été créé avec succès. Vous pouvez maintenant accéder à la plateforme
        pour collaborer sur vos projets d'édition.
      </p>

      <div class="card">
        <div class="card-title">Vos identifiants</div>
        <div style="margin-top: 12px;">
          <p style="margin-bottom: 8px;"><strong>Email :</strong> ${recipientEmail}</p>
          ${temporaryPassword ? `<p><strong>Mot de passe temporaire :</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${temporaryPassword}</code></p>` : ''}
        </div>
      </div>

      ${temporaryPassword ? `
        <div class="card" style="background: #fef3c7; border-color: #fbbf24;">
          <p style="color: #92400e; font-size: 14px;">
            <strong>Important :</strong> Nous vous recommandons de changer votre mot de passe
            lors de votre première connexion.
          </p>
        </div>
      ` : ''}

      <a href="${loginUrl || FRONTEND_URL}" class="btn">Se connecter</a>
    </div>
  `;

  const mailOptions = {
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `[WeValid] Bienvenue sur WeValid !`,
    html: getEmailTemplate(content),
    text: `
Bienvenue sur WeValid, ${recipientName} !

Votre compte a été créé avec succès.

Email : ${recipientEmail}
${temporaryPassword ? `Mot de passe temporaire : ${temporaryPassword}` : ''}

${temporaryPassword ? 'Important : Nous vous recommandons de changer votre mot de passe lors de votre première connexion.' : ''}

Se connecter : ${loginUrl || FRONTEND_URL}

--
Cet email a été envoyé automatiquement par WeValid.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé:', { to: recipientEmail, type: 'welcome' });
    return true;
  } catch (error) {
    logger.error('Erreur envoi email:', { error: error.message, to: recipientEmail });
    return false;
  }
}

/**
 * Parse les mentions dans un texte et retourne les noms mentionnés
 */
function parseMentions(text) {
  const mentionRegex = /@([A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1].trim());
  }
  return mentions;
}

module.exports = {
  sendStatusChangeNotification,
  sendProjectInvitationNotification,
  sendPdfReadyNotification,
  sendMentionNotification,
  sendCommentNotification,
  sendWelcomeEmail,
  parseMentions,
  transporter
};
