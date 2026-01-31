// Services pour les utilisateurs

import apiClient from './client';
import type { User, UserRole } from '@/types';

export interface UsersFilters {
  role?: string;
  search?: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: UserRole;
}

export interface UpdateUserData {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
}

export interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  email?: string;
  sanitize_filenames?: boolean;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export const usersApi = {
  async getMe(): Promise<{ user: User }> {
    return apiClient.get('/users/me');
  },

  async updateMe(data: UpdateProfileData): Promise<{ message: string; user: User }> {
    return apiClient.put('/users/me', data);
  },

  async changePassword(data: ChangePasswordData): Promise<{ message: string }> {
    return apiClient.put('/users/me/password', data);
  },

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

  async create(data: CreateUserData): Promise<{ message: string; user: User }> {
    return apiClient.post('/users', data);
  },

  async update(id: number, data: UpdateUserData): Promise<{ message: string; user: User }> {
    return apiClient.put(`/users/${id}`, data);
  },

  async setStatus(id: number, isActive: boolean): Promise<{ message: string; user: User }> {
    return apiClient.patch(`/users/${id}/status`, { is_active: isActive });
  },

  async delete(id: number): Promise<{ message: string }> {
    return apiClient.delete(`/users/${id}`);
  },
};
