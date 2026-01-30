// Services pour les fichiers

import apiClient from './client';
import type { FileItem } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7801/api';

export interface UploadOptions {
  sanitizeFilename?: boolean; // Default: true - if false, preserves accents and spaces
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
};
