'use client';

import { useState, useEffect, useCallback } from 'react';
import { projectsApi } from '@/lib/api/projects';
import { publishersApi } from '@/lib/api/publishers';
import { projectFilesApi } from '@/lib/api/project-files';
import { usersApi } from '@/lib/api/users';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, FileText, Image, X, Upload, Users, UserPlus } from 'lucide-react';
import type { Publisher, User } from '@/types';

// Predefined book formats
const BOOK_FORMATS = [
  { label: 'Personnalisé', width: null, height: null },
  { label: 'A4 (210 × 297 mm)', width: 210, height: 297 },
  { label: 'A5 (148 × 210 mm)', width: 148, height: 210 },
  { label: 'Poche (110 × 178 mm)', width: 110, height: 178 },
  { label: 'Carré petit (150 × 150 mm)', width: 150, height: 150 },
  { label: 'Carré moyen (200 × 200 mm)', width: 200, height: 200 },
  { label: 'Carré grand (250 × 250 mm)', width: 250, height: 250 },
  { label: 'Roman (140 × 216 mm)', width: 140, height: 216 },
  { label: 'Beau livre (240 × 300 mm)', width: 240, height: 300 },
];

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateProjectDialogProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loadingPublishers, setLoadingPublishers] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('Personnalisé');
  const [formData, setFormData] = useState({
    title: '',
    isbn: '',
    description: '',
    total_pages: '',
    publisher_id: '',
    width_mm: '',
    height_mm: '',
  });

  // File upload state
  const [wantDocuments, setWantDocuments] = useState(false);
  const [wantImages, setWantImages] = useState(false);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  // Users state
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load publishers when dialog opens
  useEffect(() => {
    if (open && (user?.role === 'admin' || user?.role === 'fabricant')) {
      setLoadingPublishers(true);
      publishersApi
        .getAll()
        .then((response) => setPublishers(response.publishers))
        .catch((error) => {
          console.error('Failed to load publishers:', error);
        })
        .finally(() => setLoadingPublishers(false));
    }
  }, [open, user?.role]);

  // Load users when dialog opens
  useEffect(() => {
    if (open && (user?.role === 'admin' || user?.role === 'fabricant' || user?.role === 'editeur')) {
      setLoadingUsers(true);
      usersApi
        .getAll()
        .then((response) => setAvailableUsers(response.users.filter((u: User) => u.id !== user?.id)))
        .catch((error) => {
          console.error('Failed to load users:', error);
        })
        .finally(() => setLoadingUsers(false));
    }
  }, [open, user?.role, user?.id]);

  // Handle format selection
  const handleFormatChange = (formatLabel: string) => {
    setSelectedFormat(formatLabel);
    const format = BOOK_FORMATS.find((f) => f.label === formatLabel);
    if (format && format.width && format.height) {
      setFormData({
        ...formData,
        width_mm: String(format.width),
        height_mm: String(format.height),
      });
    }
  };

  // Handle file drops
  const handleDocumentDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.includes('word') || f.type.includes('rtf') || f.type === 'application/pdf' || f.name.endsWith('.rtf')
    );
    setDocumentFiles(prev => [...prev, ...files]);
  }, []);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setImageFiles(prev => [...prev, ...files]);
  }, []);

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDocumentFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImageFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeDocument = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setUploadProgress(0);
    setUploadStatus('');

    try {
      // 1. Create the project
      setUploadStatus('Création du projet...');
      const result = await projectsApi.create({
        title: formData.title,
        isbn: formData.isbn || undefined,
        description: formData.description || undefined,
        total_pages: parseInt(formData.total_pages) || 1,
        publisher_id: formData.publisher_id && formData.publisher_id !== 'none' ? parseInt(formData.publisher_id) : undefined,
        width_mm: formData.width_mm ? parseInt(formData.width_mm) : undefined,
        height_mm: formData.height_mm ? parseInt(formData.height_mm) : undefined,
      });

      const projectId = result.project.id;
      setUploadProgress(20);

      // 2. Upload document files if any
      if (documentFiles.length > 0) {
        setUploadStatus(`Upload des documents (${documentFiles.length} fichiers)...`);
        await projectFilesApi.upload(projectId, documentFiles, {
          category: 'document',
          description: `Projet #${projectId} - ${formData.title}`,
        });
        setUploadProgress(60);
      }

      // 3. Upload image files if any
      if (imageFiles.length > 0) {
        setUploadStatus(`Upload des images (${imageFiles.length} fichiers)...`);
        await projectFilesApi.upload(projectId, imageFiles, {
          category: 'image',
          description: `Projet #${projectId} - ${formData.title}`,
        });
        setUploadProgress(80);
      }

      // 4. Add selected users to project
      if (selectedUserIds.length > 0) {
        setUploadStatus(`Ajout des membres (${selectedUserIds.length})...`);
        for (const userId of selectedUserIds) {
          try {
            await projectsApi.addMember(projectId, userId);
          } catch (error) {
            console.error(`Failed to add user ${userId}:`, error);
          }
        }
        setUploadProgress(100);
      }

      const totalFiles = documentFiles.length + imageFiles.length;
      const message = [];
      if (totalFiles > 0) message.push(`${totalFiles} fichier(s)`);
      if (selectedUserIds.length > 0) message.push(`${selectedUserIds.length} membre(s)`);

      if (message.length > 0) {
        toast.success(`Projet créé avec ${message.join(' et ')}`);
      } else {
        toast.success('Projet créé avec succès');
      }

      // Reset form
      setFormData({
        title: '',
        isbn: '',
        description: '',
        total_pages: '',
        publisher_id: '',
        width_mm: '',
        height_mm: '',
      });
      setSelectedFormat('Personnalisé');
      setWantDocuments(false);
      setWantImages(false);
      setDocumentFiles([]);
      setImageFiles([]);
      setSelectedUserIds([]);
      setUploadProgress(0);
      setUploadStatus('');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la création');
    } finally {
      setIsLoading(false);
    }
  };

  const isCustomFormat = selectedFormat === 'Personnalisé';
  const showPublisherSelect = user?.role === 'admin' || user?.role === 'fabricant';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>
            Créez un nouveau projet de production éditoriale.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              placeholder="Mon nouveau livre"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          {showPublisherSelect && (
            <div className="space-y-2">
              <Label htmlFor="publisher">Maison d&apos;édition</Label>
              <Select
                value={formData.publisher_id}
                onValueChange={(value) => setFormData({ ...formData, publisher_id: value })}
                disabled={loadingPublishers}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingPublishers ? 'Chargement...' : 'Sélectionner une maison'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {publishers.map((publisher) => (
                    <SelectItem key={publisher.id} value={String(publisher.id)}>
                      {publisher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="isbn">ISBN</Label>
            <Input
              id="isbn"
              placeholder="978-2-1234-5678-9"
              value={formData.isbn}
              onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="total_pages">Nombre de pages *</Label>
            <Input
              id="total_pages"
              type="number"
              min="1"
              max="9999"
              placeholder="150"
              value={formData.total_pages}
              onChange={(e) => setFormData({ ...formData, total_pages: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="format">Format du livre</Label>
            <Select value={selectedFormat} onValueChange={handleFormatChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un format" />
              </SelectTrigger>
              <SelectContent>
                {BOOK_FORMATS.map((format) => (
                  <SelectItem key={format.label} value={format.label}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width_mm">Largeur (mm)</Label>
              <Input
                id="width_mm"
                type="number"
                min="50"
                max="1000"
                placeholder="210"
                value={formData.width_mm}
                onChange={(e) => setFormData({ ...formData, width_mm: e.target.value })}
                disabled={!isCustomFormat}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height_mm">Hauteur (mm)</Label>
              <Input
                id="height_mm"
                type="number"
                min="50"
                max="1000"
                placeholder="297"
                value={formData.height_mm}
                onChange={(e) => setFormData({ ...formData, height_mm: e.target.value })}
                disabled={!isCustomFormat}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Description du projet..."
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {/* File upload options */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base">Fichiers à importer</Label>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="want-documents"
                checked={wantDocuments}
                onCheckedChange={(checked) => setWantDocuments(checked === true)}
              />
              <label
                htmlFor="want-documents"
                className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Textes (Word, RTF, PDF)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="want-images"
                checked={wantImages}
                onCheckedChange={(checked) => setWantImages(checked === true)}
              />
              <label
                htmlFor="want-images"
                className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
              >
                <Image className="h-4 w-4" />
                Images (JPEG, PNG, TIFF...)
              </label>
            </div>

            {/* Document upload zone */}
            {wantDocuments && (
              <div className="space-y-2">
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onDrop={handleDocumentDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => document.getElementById('doc-input')?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Glissez vos documents ici ou cliquez pour sélectionner
                  </p>
                  <input
                    id="doc-input"
                    type="file"
                    multiple
                    accept=".doc,.docx,.rtf,.pdf"
                    className="hidden"
                    onChange={handleDocumentSelect}
                  />
                </div>
                {documentFiles.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {documentFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                        <span className="truncate flex-1">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeDocument(i)}
                          className="ml-2 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Image upload zone */}
            {wantImages && (
              <div className="space-y-2">
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onDrop={handleImageDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => document.getElementById('img-input')?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Glissez vos images ici ou cliquez pour sélectionner
                  </p>
                  <input
                    id="img-input"
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                </div>
                {imageFiles.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {imageFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                        <span className="truncate flex-1">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="ml-2 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User assignment */}
          {availableUsers.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Membres du projet
              </Label>
              <p className="text-xs text-muted-foreground">
                Sélectionnez les utilisateurs qui travailleront sur ce projet
              </p>

              <Select
                onValueChange={(value) => {
                  const userId = parseInt(value);
                  if (!selectedUserIds.includes(userId)) {
                    setSelectedUserIds([...selectedUserIds, userId]);
                  }
                }}
              >
                <SelectTrigger disabled={loadingUsers}>
                  <SelectValue placeholder={loadingUsers ? 'Chargement...' : 'Ajouter un membre'} />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers
                    .filter((u) => !selectedUserIds.includes(u.id))
                    .map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.first_name} {u.last_name} ({u.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {selectedUserIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUserIds.map((userId) => {
                    const selectedUser = availableUsers.find((u) => u.id === userId);
                    if (!selectedUser) return null;
                    return (
                      <Badge key={userId} variant="secondary" className="flex items-center gap-1">
                        {selectedUser.first_name} {selectedUser.last_name}
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds(selectedUserIds.filter((id) => id !== userId))}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upload progress */}
          {isLoading && uploadStatus && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{uploadStatus}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer le projet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
