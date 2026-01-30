// Services pour les annotations

import apiClient from './client';
import type { Annotation, AnnotationType, AnnotationPosition } from '@/types';

export interface CreateAnnotationData {
  page_id: number;
  type: AnnotationType;
  content: string;
  position?: AnnotationPosition;
  color?: string;
}

export interface UpdateAnnotationData {
  content?: string;
  position?: AnnotationPosition;
  color?: string;
  resolved?: boolean;
}

export const annotationsApi = {
  async getByPage(pageId: number): Promise<{ annotations: Annotation[] }> {
    return apiClient.get(`/annotations/page/${pageId}`);
  },

  async create(data: CreateAnnotationData): Promise<{ message: string; annotation: Annotation }> {
    return apiClient.post('/annotations', data);
  },

  async update(id: number, data: UpdateAnnotationData): Promise<{ message: string; annotation: Annotation }> {
    return apiClient.put(`/annotations/${id}`, data);
  },

  async delete(id: number): Promise<{ message: string }> {
    return apiClient.delete(`/annotations/${id}`);
  },

  async resolve(id: number): Promise<{ message: string; annotation: Annotation }> {
    return apiClient.put(`/annotations/${id}`, { resolved: true });
  },

  // XFDF Import/Export for Acrobat compatibility
  async exportXfdf(pageId: number): Promise<string> {
    const response = await apiClient.get(`/annotations/page/${pageId}/export-xfdf`);
    return response as unknown as string;
  },

  async importXfdf(pageId: number, xfdf: string): Promise<{ message: string; imported: number }> {
    return apiClient.post(`/annotations/page/${pageId}/import-xfdf`, { xfdf });
  },

  getExportXfdfUrl(pageId: number): string {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7801/api';
    return `${API_BASE_URL}/annotations/page/${pageId}/export-xfdf`;
  },
};
