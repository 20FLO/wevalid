// Services pour les annotations

import apiClient from './client';
import type { Annotation, AnnotationType, AnnotationPosition, AnnotationReply } from '@/types';

export type AnnotationStatus = 'open' | 'resolved' | 'rejected';

export interface CreateAnnotationData {
  page_id: number;
  type: AnnotationType;
  content: string;
  position?: AnnotationPosition;
  color?: string;
  file_id?: number;
}

export interface UpdateAnnotationData {
  content?: string;
  position?: AnnotationPosition;
  color?: string;
  resolved?: boolean;
}

export interface UpdateStatusData {
  status: AnnotationStatus;
  status_reason?: string;
  resolved_in_version?: number;
}

export const annotationsApi = {
  async getByPage(pageId: number, fileId?: number): Promise<{ annotations: Annotation[] }> {
    const params = fileId ? `?file_id=${fileId}` : '';
    return apiClient.get(`/annotations/page/${pageId}${params}`);
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

  // Status management (open, resolved, rejected)
  async updateStatus(id: number, data: UpdateStatusData): Promise<{ message: string; annotation: Annotation }> {
    return apiClient.put(`/annotations/${id}/status`, data);
  },

  // Replies (threaded discussions)
  async getReplies(annotationId: number): Promise<{ replies: AnnotationReply[] }> {
    return apiClient.get(`/annotations/${annotationId}/replies`);
  },

  async addReply(annotationId: number, content: string): Promise<{ message: string; reply: AnnotationReply }> {
    return apiClient.post(`/annotations/${annotationId}/replies`, { content });
  },

  async deleteReply(annotationId: number, replyId: number): Promise<{ message: string }> {
    return apiClient.delete(`/annotations/${annotationId}/replies/${replyId}`);
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
