// Services pour les maisons d'édition

import apiClient from './client';
import type { Publisher } from '@/types';

export interface PublishersResponse {
  publishers: Publisher[];
}

export interface CreatePublisherData {
  name: string;
  description?: string;
}

export const publishersApi = {
  async getAll(search?: string): Promise<PublishersResponse> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    const query = params.toString();
    return apiClient.get(`/publishers${query ? `?${query}` : ''}`);
  },

  async getById(id: number): Promise<{ publisher: Publisher }> {
    return apiClient.get(`/publishers/${id}`);
  },

  async create(data: CreatePublisherData): Promise<{ message: string; publisher: Publisher }> {
    return apiClient.post('/publishers', data);
  },

  async update(id: number, data: Partial<CreatePublisherData>): Promise<{ message: string; publisher: Publisher }> {
    return apiClient.put(`/publishers/${id}`, data);
  },

  async delete(id: number): Promise<{ message: string }> {
    return apiClient.delete(`/publishers/${id}`);
  },

  async addMember(publisherId: number, userId: number, role: 'admin' | 'member' = 'member'): Promise<{ message: string }> {
    return apiClient.post(`/publishers/${publisherId}/members`, { user_id: userId, role });
  },

  async removeMember(publisherId: number, userId: number): Promise<{ message: string }> {
    return apiClient.delete(`/publishers/${publisherId}/members/${userId}`);
  },
};
