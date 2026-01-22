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
