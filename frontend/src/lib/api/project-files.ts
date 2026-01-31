// API client pour les fichiers projet

import apiClient from './client';
import type { ProjectFile, FileCategory } from '@/types';

export interface UploadProjectFilesResponse {
  message: string;
  files: ProjectFile[];
}

export const projectFilesApi = {
  // Liste des fichiers d'un projet
  async getAll(projectId: number, category?: FileCategory): Promise<{ files: ProjectFile[] }> {
    const params = category ? `?category=${category}` : '';
    return apiClient.get(`/project-files/${projectId}${params}`);
  },

  // Upload de fichiers
  async upload(
    projectId: number,
    files: File[],
    options?: { category?: FileCategory; description?: string; sanitizeFilename?: boolean }
  ): Promise<UploadProjectFilesResponse> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    if (options?.category) {
      formData.append('category', options.category);
    }
    if (options?.description) {
      formData.append('description', options.description);
    }
    const queryParams = options?.sanitizeFilename === true ? '?sanitize_filename=true' : '';
    return apiClient.upload(`/project-files/${projectId}/upload${queryParams}`, formData);
  },

  // URL de téléchargement
  getDownloadUrl(fileId: number): string {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    return `${baseUrl}/project-files/download/${fileId}`;
  },

  // Télécharger un fichier (avec token)
  async download(fileId: number): Promise<Blob> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const response = await fetch(this.getDownloadUrl(fileId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error('Erreur téléchargement');
    }
    return response.blob();
  },

  // Modifier les métadonnées
  async update(
    fileId: number,
    data: { description?: string; category?: FileCategory }
  ): Promise<{ message: string; file: ProjectFile }> {
    return apiClient.put(`/project-files/${fileId}`, data);
  },

  // Supprimer un fichier
  async delete(fileId: number): Promise<{ message: string }> {
    return apiClient.delete(`/project-files/${fileId}`);
  },

  // Uploader une nouvelle version
  async uploadNewVersion(fileId: number, file: File): Promise<{ message: string; file: ProjectFile }> {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload(`/project-files/${fileId}/new-version`, formData);
  },

  // Historique des versions
  async getVersions(fileId: number): Promise<{ versions: ProjectFile[] }> {
    return apiClient.get(`/project-files/${fileId}/versions`);
  },
};
