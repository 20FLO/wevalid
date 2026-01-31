// Services pour les fichiers

import apiClient from './client';
import type { FileItem } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7801/api';

export interface UploadOptions {
  sanitizeFilename?: boolean; // Default: true - if false, preserves accents and spaces
}

export interface UploadWithLabelsResult {
  message: string;
  files: FileItem[];
  assignments: Array<{
    filename: string;
    status: 'success' | 'skipped';
    page_number?: number;
    detected_label?: string;
    reason?: string;
    version?: number;
  }>;
  annotations_extracted: number;
}

export const filesApi = {
  async upload(
    pageId: number,
    files: File[],
    options?: UploadOptions
  ): Promise<{ message: string; files: FileItem[] }> {
    const formData = new FormData();
    formData.append('page_id', String(pageId));
    files.forEach((file) => {
      formData.append('files', file);
    });
    const queryParams = options?.sanitizeFilename === false ? '?sanitize_filename=false' : '';
    return apiClient.post(`/files/upload${queryParams}`, formData);
  },

  /**
   * Upload a complete PDF and split it across project pages
   * @param projectId Project ID
   * @param file PDF file to upload
   * @param startPage Starting page number (for partial uploads starting at page 50 for example)
   * @param options Upload options (sanitizeFilename)
   */
  async uploadCompletePdf(
    projectId: number,
    file: File,
    startPage?: number,
    options?: UploadOptions
  ): Promise<{
    message: string;
    files: FileItem[];
    stats: { pdf_pages: number; project_pages: number; files_created: number };
  }> {
    const formData = new FormData();
    formData.append('project_id', String(projectId));
    formData.append('file', file);
    if (startPage !== undefined) {
      formData.append('start_page', String(startPage));
    }
    const queryParams = options?.sanitizeFilename === false ? '?sanitize_filename=false' : '';
    return apiClient.post(`/files/upload-complete-pdf${queryParams}`, formData);
  },

  async delete(fileId: number): Promise<{ message: string }> {
    return apiClient.delete(`/files/${fileId}`);
  },

  getDownloadUrl(fileId: number): string {
    return `${API_BASE_URL}/files/download/${fileId}`;
  },

  getThumbnailUrl(fileId: number): string {
    return `${API_BASE_URL}/files/thumbnail/${fileId}`;
  },

  async download(fileId: number): Promise<Blob> {
    return apiClient.get(`/files/download/${fileId}`);
  },

  /**
   * Get URL to download PDF with embedded annotations
   */
  getAnnotatedDownloadUrl(fileId: number): string {
    return `${API_BASE_URL}/files/download-annotated/${fileId}`;
  },

  /**
   * Get all versions of a page's files
   */
  async getVersionHistory(pageId: number): Promise<{
    page_id: string;
    versions: FileItem[];
  }> {
    return apiClient.get(`/files/page/${pageId}/history`);
  },

  /**
   * Upload files with automatic page detection via Page Labels
   * Files are assigned to pages based on their PDF page labels or filename patterns
   */
  async uploadWithLabels(
    projectId: number,
    files: File[],
    options?: UploadOptions
  ): Promise<UploadWithLabelsResult> {
    const formData = new FormData();
    formData.append('project_id', String(projectId));
    files.forEach((file) => {
      formData.append('files', file);
    });
    const queryParams = options?.sanitizeFilename === false ? '?sanitize_filename=false' : '';
    return apiClient.post(`/files/upload-with-labels${queryParams}`, formData);
  },

  /**
   * Get URL to download multiple pages as a single PDF
   */
  getMultiPageDownloadUrl(): string {
    return `${API_BASE_URL}/files/download-multi`;
  },

  /**
   * Download multiple pages as a single PDF
   */
  async downloadMultiPage(pageIds: number[], includeAnnotations: boolean = true): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/files/download-multi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: JSON.stringify({
        page_ids: pageIds,
        include_annotations: includeAnnotations,
      }),
    });

    if (!response.ok) {
      throw new Error('Erreur lors du téléchargement');
    }

    return response.blob();
  },

  /**
   * Get URL to download entire project as PDF
   */
  getProjectDownloadUrl(projectId: number, includeAnnotations: boolean = true): string {
    return `${API_BASE_URL}/files/download-project/${projectId}?annotations=${includeAnnotations}`;
  },

  /**
   * Download entire project as a single PDF
   */
  async downloadProject(projectId: number, includeAnnotations: boolean = true): Promise<Blob> {
    const response = await fetch(
      `${API_BASE_URL}/files/download-project/${projectId}?annotations=${includeAnnotations}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Erreur lors du téléchargement');
    }

    return response.blob();
  },
};
