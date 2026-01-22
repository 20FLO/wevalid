// Services d'authentification

import apiClient from './client';
import type { AuthResponse, User } from '@/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    apiClient.setTokens(response.accessToken, response.refreshToken);
    return response;
  },

  async register(data: RegisterData): Promise<{ message: string; user: User }> {
    return apiClient.post('/auth/register', data);
  },

  async logout(): Promise<void> {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } finally {
      apiClient.clearTokens();
    }
  },

  async getProfile(): Promise<{ user: User }> {
    return apiClient.get('/users/me');
  },

  async updateProfile(data: Partial<Pick<User, 'first_name' | 'last_name' | 'email'>>): Promise<{ user: User }> {
    return apiClient.put('/users/me', data);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiClient.put('/users/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};
