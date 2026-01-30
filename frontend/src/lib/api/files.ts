// Services pour les fichiers

import apiClient from './client';
import type { FileItem } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7801/api';

export const filesApi = {
  async upload(pageId: number, files: File[]): Promise<{ message: string; files: FileItem[] }> {
    const formData = new FormData();
    formData.append('page_id', String(pageId));
    files.forEach((file) => {
      formData.append('files', file);
    });
    return apiClient.post('/files/upload', formData);
  },

  /**
   * Upload a complete PDF and split it across project pages
   * @param projectId Project ID
   * @param file PDF file to upload
   * @param startPage Starting page number (for partial uploads starting at page 50 for example)
   */
  async uploadCompletePdf(
    projectId: number,
    file: File,
    startPage?: number
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
    return apiClient.post('/files/upload-complete-pdf', formData);
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
};
