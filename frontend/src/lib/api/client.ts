// Client API pour Wevalid

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7801/api';

interface TokenStorage {
  accessToken: string | null;
  refreshToken: string | null;
}

class ApiClient {
  private tokens: TokenStorage = {
    accessToken: null,
    refreshToken: null,
  };

  private initialized = false;

  private init() {
    if (this.initialized) return;
    if (typeof window !== 'undefined') {
      this.tokens.accessToken = localStorage.getItem('accessToken');
      this.tokens.refreshToken = localStorage.getItem('refreshToken');
      this.initialized = true;
    }
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.tokens.accessToken = accessToken;
    this.tokens.refreshToken = refreshToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  clearTokens() {
    this.tokens.accessToken = null;
    this.tokens.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  getAccessToken(): string | null {
    this.init();
    return this.tokens.accessToken;
  }

  isAuthenticated(): boolean {
    this.init();
    return !!this.tokens.accessToken;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.tokens.refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.tokens.accessToken = data.accessToken;
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', data.accessToken);
        }
        return true;
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }

    this.clearTokens();
    return false;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    this.init();

    const url = `${API_BASE_URL}${endpoint}`;

    const headers: HeadersInit = {
      ...options.headers,
    };

    // Ajouter Content-Type sauf pour FormData
    if (!(options.body instanceof FormData)) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    // Ajouter le token d'authentification
    if (this.tokens.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }

    let response: Response;

    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkError) {
      console.error('Network error:', networkError);
      throw new Error('Erreur réseau - vérifiez que le backend est démarré');
    }

    // Si 401, essayer de rafraîchir le token
    if (response.status === 401 && this.tokens.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${this.tokens.accessToken}`;
        response = await fetch(url, { ...options, headers });
      }
    }

    // Si toujours 401, rediriger vers login
    if (response.status === 401) {
      this.clearTokens();
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Session expirée');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Erreur inconnue' } }));
      // Le backend renvoie { error: { message: "..." } }
      const errorMessage = errorData?.error?.message || errorData?.message || errorData?.error || 'Erreur API';
      throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Erreur API');
    }

    // Pour les téléchargements de fichiers
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/octet-stream') ||
        contentType?.includes('image/') ||
        response.headers.get('content-disposition')) {
      return response.blob() as unknown as T;
    }

    return response.json();
  }

  // Méthodes utilitaires
  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  upload<T>(endpoint: string, formData: FormData) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
