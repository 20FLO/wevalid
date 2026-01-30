// API client pour la recherche globale

import apiClient from './client';

export interface SearchResultProject {
  id: number;
  title: string;
  isbn?: string;
  description?: string;
  status: string;
  type: 'project';
}

export interface SearchResultProjectFile {
  id: number;
  title: string;
  description?: string;
  category: string;
  project_id: number;
  project_title: string;
  type: 'project_file';
}

export interface SearchResultPageFile {
  id: number;
  title: string;
  page_number: number;
  project_id: number;
  project_title: string;
  type: 'page_file';
}

export interface SearchResultPublisher {
  id: number;
  title: string;
  description?: string;
  type: 'publisher';
}

export interface SearchResults {
  query: string;
  results: {
    projects: SearchResultProject[];
    project_files: SearchResultProjectFile[];
    page_files: SearchResultPageFile[];
    publishers: SearchResultPublisher[];
  };
  total: number;
}

export const searchApi = {
  async search(query: string): Promise<SearchResults> {
    return apiClient.get(`/search?q=${encodeURIComponent(query)}`);
  },
};
