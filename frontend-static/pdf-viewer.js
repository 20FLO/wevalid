// pdf-viewer.js

// Configuration
const API_URL = 'https://wevalid.rmax.synology.me/api';
let TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZWRpdGV1ckB3ZXZhbGlkLmNvbSIsInJvbGUiOiJlZGl0ZXVyIiwiaWF0IjoxNzY5MDgxODM2LCJleHAiOjE3NjkwODU0MzZ9.RCc2nBlN7VKdGIf4SBNo8CtRNZo4AOPMo8EYR5Mw-QY';
let FILE_ID = 1; // L'ID du fichier qu'on vient d'uploader
let PAGE_ID = 1; // ID de la page pour les annotations

// État de l'application
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.5;
let annotations = [];

// Éléments DOM
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const annotationsLayer = document.getElementById('annotations-layer');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const fullscreenBtn = document.getElementById('fullscreen');
const pageInfo = document.getElementById('page-info');
const zoomLevel = document.getElementById('zoom-level');
const annotationsList = document.getElementById('annotations-list');
const annotationsCount = document.getElementById('annotations-count');
const addAnnotationBtn = document.getElementById('add-annotation-btn');

// Configuration PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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

    showLoading('Chargement du PDF...');

    try {
        // Charger le PDF
        await loadPDF();
        
        // Charger les annotations
        await loadAnnotations();
        
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
// CHARGEMENT PDF
// ============================================

async function loadPDF() {
    const pdfUrl = `${API_URL}/files/download/${FILE_ID}`;
    
    const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        httpHeaders: {
            'Authorization': `Bearer ${TOKEN}`
        }
    });

    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    
    await renderPage(currentPage);
}

async function renderPage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Ajuster le SVG des annotations
    annotationsLayer.setAttribute('width', viewport.width);
    annotationsLayer.setAttribute('height', viewport.height);
    annotationsLayer.style.width = viewport.width + 'px';
    annotationsLayer.style.height = viewport.height + 'px';

    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };

    await page.render(renderContext).promise;
    
    // Mettre à jour l'interface
    updatePageInfo();
    renderAnnotations();
}

function updatePageInfo() {
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    zoomLevel.textContent = `${Math.round(scale * 100)}%`;
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

// ============================================
// NAVIGATION
// ============================================

function setupEventListeners() {
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage(currentPage);
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
        }
    });

    zoomInBtn.addEventListener('click', () => {
        scale += 0.25;
        renderPage(currentPage);
    });

    zoomOutBtn.addEventListener('click', () => {
        if (scale > 0.5) {
            scale -= 0.25;
            renderPage(currentPage);
        }
    });

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    addAnnotationBtn.addEventListener('click', () => {
        showAnnotationModal();
    });

    // Clic sur le canvas pour créer une annotation
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        showAnnotationModal(x, y);
    });
}

// ============================================
// ANNOTATIONS - API
// ============================================

async function loadAnnotations() {
    try {
        const response = await fetch(`${API_URL}/annotations/page/${PAGE_ID}`, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!response.ok) throw new Error('Erreur chargement annotations');

        const data = await response.json();
        annotations = data.annotations || [];
        
        renderAnnotationsList();
        renderAnnotations();
    } catch (error) {
        console.error('Erreur chargement annotations:', error);
    }
}

async function createAnnotation(annotationData) {
    try {
        const response = await fetch(`${API_URL}/annotations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(annotationData)
        });

        if (!response.ok) throw new Error('Erreur création annotation');

        const data = await response.json();
        annotations.push(data.annotation);
        
        renderAnnotationsList();
        renderAnnotations();
        
        return data.annotation;
    } catch (error) {
        console.error('Erreur création annotation:', error);
        alert('Erreur lors de la création de l\'annotation');
    }
}

async function deleteAnnotation(id) {
    if (!confirm('Supprimer cette annotation ?')) return;

    try {
        const response = await fetch(`${API_URL}/annotations/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!response.ok) throw new Error('Erreur suppression annotation');

        annotations = annotations.filter(a => a.id !== id);
        
        renderAnnotationsList();
        renderAnnotations();
    } catch (error) {
        console.error('Erreur suppression annotation:', error);
        alert('Erreur lors de la suppression');
    }
}

async function toggleResolvedAnnotation(id, resolved) {
    try {
        const response = await fetch(`${API_URL}/annotations/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ resolved })
        });

        if (!response.ok) throw new Error('Erreur mise à jour annotation');

        const annotation = annotations.find(a => a.id === id);
        if (annotation) {
            annotation.resolved = resolved;
        }
        
        renderAnnotationsList();
        renderAnnotations();
    } catch (error) {
        console.error('Erreur mise à jour annotation:', error);
    }
}

// ============================================
// ANNOTATIONS - AFFICHAGE
// ============================================

function renderAnnotationsList() {
    annotationsList.innerHTML = '';
    annotationsCount.textContent = annotations.length;

    annotations.forEach(annotation => {
        const item = document.createElement('div');
        item.className = `annotation-item ${annotation.resolved ? 'resolved' : ''}`;
        
        const typeLabel = annotation.type === 'comment' ? '💬' : '🖍️';
        const typeClass = annotation.type === 'highlight' ? 'highlight' : '';
        
        item.innerHTML = `
            <div class="annotation-header">
                <span class="annotation-author">${typeLabel} ${annotation.author_name || 'Utilisateur'}</span>
                <span class="annotation-type ${typeClass}">${annotation.type}</span>
            </div>
            <div class="annotation-content">${annotation.content}</div>
            <div class="annotation-footer">
                <span>${new Date(annotation.created_at).toLocaleDateString('fr-FR')}</span>
                <div class="annotation-actions">
                    <button onclick="toggleResolvedAnnotation(${annotation.id}, ${!annotation.resolved})">
                        ${annotation.resolved ? '↩ Rouvrir' : '✓ Résoudre'}
                    </button>
                    <button class="delete" onclick="deleteAnnotation(${annotation.id})">✕ Supprimer</button>
                </div>
            </div>
        `;
        
        // Clic pour aller à l'annotation
        item.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                scrollToAnnotation(annotation);
            }
        });
        
        annotationsList.appendChild(item);
    });
}

function renderAnnotations() {
    // Vider le SVG
    annotationsLayer.innerHTML = '';

    annotations.forEach(annotation => {
        const pos = annotation.position;
        
        if (pos.page_number !== currentPage) return;

        if (annotation.type === 'comment') {
            // Marqueur commentaire
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            marker.setAttribute('cx', pos.x);
            marker.setAttribute('cy', pos.y);
            marker.setAttribute('r', '12');
            marker.setAttribute('fill', annotation.resolved ? '#27ae60' : '#3498db');
            marker.setAttribute('class', 'annotation-marker');
            marker.style.cursor = 'pointer';
            
            marker.addEventListener('click', () => {
                alert(`Annotation: ${annotation.content}\nPar: ${annotation.author_name}`);
            });
            
            annotationsLayer.appendChild(marker);
        } else if (annotation.type === 'highlight') {
            // Rectangle de surlignage
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', pos.x);
            rect.setAttribute('y', pos.y);
            rect.setAttribute('width', pos.width || 100);
            rect.setAttribute('height', pos.height || 20);
            rect.setAttribute('fill', annotation.color || '#FFFF00');
            rect.setAttribute('opacity', '0.4');
            rect.setAttribute('class', 'annotation-marker');
            
            annotationsLayer.appendChild(rect);
        }
    });
}

function scrollToAnnotation(annotation) {
    const pos = annotation.position;
    
    if (pos.page_number !== currentPage) {
        currentPage = pos.page_number;
        renderPage(currentPage);
    }
    
    // Scroll vers la position (simplifiée)
    canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================
// MODAL CRÉATION ANNOTATION
// ============================================

function showAnnotationModal(x = null, y = null) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Nouvelle annotation</h3>
            <form id="annotation-form">
                <div class="form-group">
                    <label>Type</label>
                    <select id="annotation-type" required>
                        <option value="comment">💬 Commentaire</option>
                        <option value="highlight">🖍️ Surlignage</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Contenu</label>
                    <textarea id="annotation-content" required placeholder="Votre commentaire..."></textarea>
                </div>
                <div class="form-group" id="color-group" style="display:none;">
                    <label>Couleur</label>
                    <input type="color" id="annotation-color" value="#FFFF00">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Annuler</button>
                    <button type="submit" class="btn-primary">Créer</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const form = modal.querySelector('#annotation-form');
    const typeSelect = modal.querySelector('#annotation-type');
    const colorGroup = modal.querySelector('#color-group');
    
    typeSelect.addEventListener('change', () => {
        colorGroup.style.display = typeSelect.value === 'highlight' ? 'block' : 'none';
    });
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const type = document.getElementById('annotation-type').value;
        const content = document.getElementById('annotation-content').value;
        const color = document.getElementById('annotation-color').value;
        
        const annotationData = {
            page_id: PAGE_ID,
            type: type,
            content: content,
            position: {
                x: x || 100,
                y: y || 100,
                width: type === 'highlight' ? 150 : 0,
                height: type === 'highlight' ? 20 : 0,
                page_number: currentPage
            },
            color: type === 'highlight' ? color : '#3498db'
        };
        
        await createAnnotation(annotationData);
        modal.remove();
    });
    
    // Fermer en cliquant en dehors
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// ============================================
// UTILITAIRES
// ============================================

function showLoading(message = 'Chargement...') {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.id = 'loading';
    loading.innerHTML = `
        <div class="loading-spinner"></div>
        <p>${message}</p>
    `;
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.remove();
}

// ============================================
// DÉMARRAGE
// ============================================

// Au chargement de la page
document.addEventListener('DOMContentLoaded', init);

// Exposer les fonctions pour les boutons inline
window.deleteAnnotation = deleteAnnotation;
window.toggleResolvedAnnotation = toggleResolvedAnnotation;