// Services pour les projets

import apiClient from './client';
import type { Project, Page, WorkflowStats, WorkflowHistory } from '@/types';

export interface ProjectsResponse {
  projects: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ProjectFilters {
  status?: string;
  search?: string;
  publisher_id?: number;
  page?: number;
  limit?: number;
}

export interface CreateProjectData {
  title: string;
  isbn?: string;
  description?: string;
  total_pages: number;
  publisher_id?: number;
  width_mm?: number;
  height_mm?: number;
}

export const projectsApi = {
  async getAll(filters?: ProjectFilters): Promise<ProjectsResponse> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.publisher_id) params.append('publisher_id', String(filters.publisher_id));
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));

    const query = params.toString();
    return apiClient.get(`/projects${query ? `?${query}` : ''}`);
  },

  async getById(id: number): Promise<{ project: Project }> {
    return apiClient.get(`/projects/${id}`);
  },

  async create(data: CreateProjectData): Promise<{ message: string; project: Project }> {
    return apiClient.post('/projects', data);
  },

  async update(id: number, data: Partial<CreateProjectData & { status: string }>): Promise<{ message: string; project: Project }> {
    return apiClient.put(`/projects/${id}`, data);
  },

  async delete(id: number): Promise<{ message: string }> {
    return apiClient.delete(`/projects/${id}`);
  },

  async addMember(projectId: number, userId: number): Promise<{ message: string }> {
    return apiClient.post(`/projects/${projectId}/members`, { user_id: userId });
  },

  async removeMember(projectId: number, userId: number): Promise<{ message: string }> {
    return apiClient.delete(`/projects/${projectId}/members/${userId}`);
  },

  // Pages
  async getPages(projectId: number): Promise<{ pages: Page[] }> {
    return apiClient.get(`/pages/project/${projectId}`);
  },

  async getPage(pageId: number): Promise<{ page: Page }> {
    return apiClient.get(`/pages/${pageId}`);
  },

  async updatePageStatus(pageId: number, status: string): Promise<{ message: string; page: Page }> {
    return apiClient.patch(`/pages/${pageId}/status`, { status });
  },

  async getPageHistory(pageId: number): Promise<{ history: WorkflowHistory[] }> {
    return apiClient.get(`/pages/${pageId}/history`);
  },

  // Workflow
  async getWorkflowStats(projectId: number): Promise<WorkflowStats> {
    return apiClient.get(`/workflows/stats/${projectId}`);
  },

  async getWorkflowHistory(projectId: number): Promise<{ history: WorkflowHistory[] }> {
    return apiClient.get(`/workflows/history/${projectId}`);
  },

  async getAllowedTransitions(status: string): Promise<{ current_status: string; user_role: string; allowed_transitions: string[] }> {
    return apiClient.get(`/workflows/transitions/${status}`);
  },
};
