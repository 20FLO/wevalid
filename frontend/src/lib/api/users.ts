// Services pour les utilisateurs

import apiClient from './client';
import type { User } from '@/types';

export interface UsersFilters {
  role?: string;
  search?: string;
}

export const usersApi = {
  async getAll(filters?: UsersFilters): Promise<{ users: User[] }> {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.search) params.append('search', filters.search);

    const query = params.toString();
    return apiClient.get(`/users${query ? `?${query}` : ''}`);
  },

  async getById(id: number): Promise<{ user: User }> {
    return apiClient.get(`/users/${id}`);
  },

  async setStatus(id: number, isActive: boolean): Promise<{ message: string; user: User }> {
    return apiClient.patch(`/users/${id}/status`, { is_active: isActive });
  },
};
