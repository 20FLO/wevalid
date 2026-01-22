// chemin-de-fer.js

// Configuration
const API_URL = 'https://wevalid.rmax.synology.me/api';
let TOKEN = ''; // À définir
let PROJECT_ID = 1; // ID du projet à afficher

// État
let project = null;
let pages = [];
let currentFilter = 'all';

// Éléments DOM
const loading = document.getElementById('loading');
const projectTitle = document.getElementById('project-title');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const statsGrid = document.getElementById('stats-grid');
const pagesGrid = document.getElementById('pages-grid');
const filterButtons = document.querySelectorAll('.filter-btn');

// Mapping des statuts
const STATUS_LABELS = {
    'attente_elements': 'Attente éléments',
    'elements_recus': 'Éléments reçus',
    'en_maquette': 'En maquette',
    'maquette_a_valider': 'Maquette à valider',
    'maquette_validee_photogravure': 'Validée photogravure',
    'en_peaufinage': 'En peaufinage',
    'en_corrections': 'En corrections',
    'en_bat': 'En BAT',
    'bat_valide': 'BAT validé',
    'envoye_imprimeur': 'Envoyé imprimeur'
};

const STATUS_COLORS = {
    'attente_elements': 'red',
    'elements_recus': 'yellow',
    'en_maquette': 'blue',
    'maquette_a_valider': 'purple',
    'maquette_validee_photogravure': 'green',
    'en_peaufinage': 'orange',
    'en_corrections': 'gray',
    'en_bat': 'brown',
    'bat_valide': 'darkgreen',
    'envoye_imprimeur': 'darkblue'
};

// ============================================
// INITIALISATION
// ============================================

async function init() {
    // Demander le token si non défini
    if (!TOKEN) {
        TOKEN = prompt('Entrez votre token d\'accès JWT:');
        if (!TOKEN) {
            alert('Token requis pour continuer');
            return;
        }
    }

    try {
        // Charger le projet
        await loadProject();
        
        // Charger les pages
        await loadPages();
        
        // Calculer les stats
        calculateStats();
        
        // Afficher
        renderPages();
        
        // Event listeners
        setupEventListeners();
        
        hideLoading();
    } catch (error) {
        hideLoading();
        alert('Erreur lors du chargement: ' + error.message);
        console.error(error);
    }
}

// ============================================
// CHARGEMENT DES DONNÉES
// ============================================

async function loadProject() {
    const response = await fetch(`${API_URL}/projects/${PROJECT_ID}`, {
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        }
    });

    if (!response.ok) throw new Error('Erreur chargement projet');

    const data = await response.json();
    project = data.project;
    
    projectTitle.textContent = project.title;
}

async function loadPages() {
    const response = await fetch(`${API_URL}/pages/project/${PROJECT_ID}`, {
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        }
    });

    if (!response.ok) throw new Error('Erreur chargement pages');

    const data = await response.json();
    pages = data.pages;
}

// ============================================
// STATISTIQUES
// ============================================

function calculateStats() {
    // Compter par statut
    const stats = {};
    pages.forEach(page => {
        stats[page.status] = (stats[page.status] || 0) + 1;
    });

    // Total pages validées (BAT validé + envoyé imprimeur)
    const validatedPages = (stats['bat_valide'] || 0) + (stats['envoye_imprimeur'] || 0);
    const totalPages = pages.length;
    const percentage = Math.round((validatedPages / totalPages) * 100);

    // Mettre à jour la barre de progression
    progressFill.style.width = percentage + '%';
    progressText.textContent = `${validatedPages} / ${totalPages} pages validées (${percentage}%)`;

    // Créer les cartes de stats
    statsGrid.innerHTML = '';
    Object.keys(STATUS_LABELS).forEach(status => {
        const count = stats[status] || 0;
        if (count > 0) {
            const card = document.createElement('div');
            card.className = `stat-card ${STATUS_COLORS[status]}`;
            card.innerHTML = `
                <div class="stat-label">${STATUS_LABELS[status]}</div>
                <div class="stat-value">${count}</div>
            `;
            statsGrid.appendChild(card);
        }
    });
}

// ============================================
// AFFICHAGE DES PAGES
// ============================================

function renderPages() {
    pagesGrid.innerHTML = '';

    pages.forEach(page => {
        const card = document.createElement('div');
        card.className = 'page-card';
        card.setAttribute('data-status', page.status);
        card.setAttribute('data-page-id', page.id);
        
        // Vérifier si la page doit être affichée selon le filtre
        if (currentFilter !== 'all' && page.status !== currentFilter) {
            card.classList.add('hidden');
        }

        // Construire le HTML avec miniature
        let thumbnailHTML = '';
        if (page.latest_file_id) {
            thumbnailHTML = `<img class="page-thumbnail" src="${API_URL}/files/thumbnail/${page.latest_file_id}" alt="Page ${page.page_number}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="page-thumbnail-placeholder" style="display:none;">📄</div>`;
        } else {
            thumbnailHTML = `<div class="page-thumbnail-placeholder">📄</div>`;
        }

        card.innerHTML = `
            ${thumbnailHTML}
            <div class="page-number">${page.page_number}</div>
            <div class="page-status">${STATUS_LABELS[page.status]}</div>
        `;

        // Clic sur la page
        card.addEventListener('click', () => {
            openPageViewer(page.id, page.page_number);
        });

        pagesGrid.appendChild(card);
    });
}

// ============================================
// FILTRES
// ============================================

function setupEventListeners() {
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Retirer active de tous
            filterButtons.forEach(b => b.classList.remove('active'));
            
            // Ajouter active au bouton cliqué
            btn.classList.add('active');
            
            // Récupérer le filtre
            currentFilter = btn.getAttribute('data-status');
            
            // Appliquer le filtre
            applyFilter();
        });
    });
}

function applyFilter() {
    const cards = document.querySelectorAll('.page-card');
    
    cards.forEach(card => {
        const status = card.getAttribute('data-status');
        
        if (currentFilter === 'all') {
            card.classList.remove('hidden');
        } else {
            if (status === currentFilter) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        }
    });
}

// ============================================
// NAVIGATION
// ============================================

function openPageViewer(pageId, pageNumber) {
    // Rediriger vers le viewer PDF avec les bons paramètres
    window.location.href = `pdf-viewer.html?page=${pageId}&pageNumber=${pageNumber}`;
}

// ============================================
// UTILITAIRES
// ============================================

function hideLoading() {
    loading.classList.add('hidden');
}

// ============================================
// DÉMARRAGE
// ============================================

document.addEventListener('DOMContentLoaded', init);