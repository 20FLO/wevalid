// Types pour l'API Wevalid

export type UserRole = 'admin' | 'auteur' | 'editeur' | 'photograveur' | 'fabricant' | 'graphiste';

// Publisher (Maison d'édition)
export interface Publisher {
  id: number;
  name: string;
  description?: string;
  members_count?: number;
  projects_count?: number;
  created_at: string;
  updated_at: string;
  members?: PublisherMember[];
}

export interface PublisherMember {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  publisher_role: 'admin' | 'member';
  joined_at: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface AuthResponse {
  message: string;
  accessToken: string;
  refreshToken: string;
  user: User;
}

export type ProjectStatus = 'draft' | 'in_progress' | 'bat' | 'completed' | 'archived';

export interface Project {
  id: number;
  title: string;
  isbn?: string;
  description?: string;
  total_pages: number;
  status: ProjectStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  total_pages_count?: string;
  validated_pages_count?: string;
  members?: ProjectMember[];
  publisher_id?: number;
  publisher_name?: string;
  width_mm?: number;
  height_mm?: number;
}

export interface ProjectMember {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  added_at: string;
}

export type PageStatus =
  | 'attente_elements'
  | 'elements_recus'
  | 'en_maquette'
  | 'maquette_a_valider'
  | 'maquette_validee_photogravure'
  | 'en_peaufinage'
  | 'en_corrections'
  | 'en_bat'
  | 'bat_valide'
  | 'envoye_imprimeur';

export const PAGE_STATUS_LABELS: Record<PageStatus, string> = {
  attente_elements: 'En attente des éléments',
  elements_recus: 'Éléments reçus',
  en_maquette: 'En maquette',
  maquette_a_valider: 'Maquette à valider',
  maquette_validee_photogravure: 'Validée - Photogravure',
  en_peaufinage: 'En peaufinage',
  en_corrections: 'En corrections',
  en_bat: 'En BAT',
  bat_valide: 'BAT validé',
  envoye_imprimeur: 'Envoyé imprimeur',
};

export const PAGE_STATUS_COLORS: Record<PageStatus, string> = {
  attente_elements: 'bg-gray-100 text-gray-800',
  elements_recus: 'bg-blue-100 text-blue-800',
  en_maquette: 'bg-yellow-100 text-yellow-800',
  maquette_a_valider: 'bg-orange-100 text-orange-800',
  maquette_validee_photogravure: 'bg-purple-100 text-purple-800',
  en_peaufinage: 'bg-pink-100 text-pink-800',
  en_corrections: 'bg-red-100 text-red-800',
  en_bat: 'bg-indigo-100 text-indigo-800',
  bat_valide: 'bg-green-100 text-green-800',
  envoye_imprimeur: 'bg-emerald-100 text-emerald-800',
};

export interface Page {
  id: number;
  project_id: number;
  page_number: number;
  status: PageStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  files_count?: string;
  annotations_count?: string;
  files?: FileItem[];
  annotations?: Annotation[];
  latest_file_id?: number;
}

export interface FileItem {
  id: number;
  page_id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  thumbnail_path?: string;
  file_type: string;
  file_size: number;
  uploaded_by: number;
  uploaded_at: string;
}

export type AnnotationType = 'comment' | 'highlight' | 'drawing' | 'stamp';

export interface AnnotationPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
  page_number?: number;
}

export interface Annotation {
  id: number;
  page_id: number;
  type: AnnotationType;
  content: string;
  position?: AnnotationPosition | string;  // Can be string from database
  color?: string;
  resolved: boolean;
  created_by: number;
  author_name?: string;
  author_role?: UserRole;
  created_at: string;
  updated_at: string;
}

export interface WorkflowHistory {
  id: number;
  page_id: number;
  page_number?: number;
  from_status: PageStatus;
  to_status: PageStatus;
  changed_by: number;
  changed_by_name?: string;
  changed_by_role?: UserRole;
  notes?: string;
  changed_at: string;
}

export interface WorkflowStats {
  project_id: number;
  total_pages: number;
  stats: {
    status: PageStatus;
    count: number;
    percentage: number;
  }[];
}

export interface PaginatedResponse<T> {
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  [key: string]: T[] | { page: number; limit: number; total: number };
}

export interface ApiError {
  error: string;
  message?: string;
}

// Fichiers projet
export type FileCategory = 'document' | 'image' | 'reference' | 'other';

export interface ProjectFile {
  id: number;
  project_id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  category: FileCategory;
  description?: string;
  version: number;
  parent_file_id?: number;
  uploaded_by: number;
  uploader_name?: string;
  uploaded_at: string;
  updated_at: string;
  versions_count?: number;
}

// Dashboard projet
export interface ProjectDashboard {
  project_id: number;
  project_title: string;
  total_pages: number;
  pages_created: number;
  pages_by_status: Record<string, number>;
  progress: {
    maquette_count: number;
    maquette_percent: number;
    validation_count: number;
    validation_percent: number;
  };
  files_count: number;
  recent_activity: {
    id: number;
    from_status: PageStatus;
    to_status: PageStatus;
    from_status_label: string;
    to_status_label: string;
    changed_at: string;
    notes?: string;
    page_number: number;
    changed_by_name: string;
  }[];
}
