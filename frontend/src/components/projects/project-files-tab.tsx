'use client';

import { useState, useCallback } from 'react';
import { projectFilesApi } from '@/lib/api/project-files';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Image,
  File,
  Download,
  Trash2,
  MoreVertical,
  RefreshCw,
  History,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import type { ProjectFile, FileCategory } from '@/types';

interface ProjectFilesTabProps {
  projectId: number;
  files: ProjectFile[];
  onRefresh: () => void;
  isLoading?: boolean;
}

const CATEGORY_LABELS: Record<FileCategory, string> = {
  document: 'Documents',
  image: 'Images',
  reference: 'Références',
  other: 'Autres',
};

const CATEGORY_ICONS: Record<FileCategory, React.ElementType> = {
  document: FileText,
  image: Image,
  reference: File,
  other: File,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectFilesTab({ projectId, files, onRefresh, isLoading }: ProjectFilesTabProps) {
  const [filter, setFilter] = useState<FileCategory | 'all'>('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showVersionsDialog, setShowVersionsDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [versions, setVersions] = useState<ProjectFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState<FileCategory>('document');
  const [uploadDescription, setUploadDescription] = useState('');

  const filteredFiles = filter === 'all' ? files : files.filter((f) => f.category === filter);

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;

    setIsUploading(true);
    try {
      await projectFilesApi.upload(projectId, uploadFiles, {
        category: uploadCategory,
        description: uploadDescription || undefined,
      });
      toast.success(`${uploadFiles.length} fichier(s) uploadé(s)`);
      setShowUploadDialog(false);
      setUploadFiles([]);
      setUploadDescription('');
      onRefresh();
    } catch (error) {
      toast.error("Erreur lors de l'upload");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (file: ProjectFile) => {
    try {
      const blob = await projectFilesApi.download(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Erreur lors du téléchargement');
    }
  };

  const handleDelete = async () => {
    if (!fileToDelete) return;

    try {
      await projectFilesApi.delete(fileToDelete.id);
      toast.success('Fichier supprimé');
      setFileToDelete(null);
      onRefresh();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleViewVersions = async (file: ProjectFile) => {
    setSelectedFile(file);
    try {
      const res = await projectFilesApi.getVersions(file.id);
      setVersions(res.versions);
      setShowVersionsDialog(true);
    } catch (error) {
      toast.error('Erreur lors de la récupération des versions');
    }
  };

  const handleUploadNewVersion = async (file: ProjectFile, newFile: File) => {
    try {
      await projectFilesApi.uploadNewVersion(file.id, newFile);
      toast.success('Nouvelle version uploadée');
      onRefresh();
      // Refresh versions dialog if open
      if (showVersionsDialog && selectedFile?.id === file.id) {
        const res = await projectFilesApi.getVersions(file.id);
        setVersions(res.versions);
      }
    } catch (error) {
      toast.error("Erreur lors de l'upload de la nouvelle version");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      setUploadFiles(Array.from(selectedFiles));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      setUploadFiles(Array.from(droppedFiles));
      setShowUploadDialog(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as FileCategory | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrer par type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les fichiers</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="reference">Références</SelectItem>
              <SelectItem value="other">Autres</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filteredFiles.length} fichier(s)
          </span>
        </div>
        <Button onClick={() => setShowUploadDialog(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Uploader des fichiers
        </Button>
      </div>

      {/* Drop zone when empty or loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => setShowUploadDialog(true)}
        >
          <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Glissez-déposez des fichiers ici ou cliquez pour uploader
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Word, RTF, PDF, images (JPEG, PNG, TIFF, etc.)
          </p>
        </div>
      ) : (
        /* Files grid */
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {filteredFiles.map((file) => {
            const IconComponent = CATEGORY_ICONS[file.category] || File;
            return (
              <Card key={file.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-muted rounded-lg">
                      <IconComponent className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" title={file.original_filename}>
                        {file.original_filename}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {CATEGORY_LABELS[file.category]}
                        </Badge>
                        {file.version > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            v{file.version}
                          </Badge>
                        )}
                        {(file.versions_count ?? 0) > 0 && (
                          <Badge variant="outline" className="text-xs">
                            +{file.versions_count} versions
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatFileSize(file.file_size)} • {formatDate(file.uploaded_at)}
                      </p>
                      {file.uploader_name && (
                        <p className="text-xs text-muted-foreground">
                          Par {file.uploader_name}
                        </p>
                      )}
                      {file.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {file.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDownload(file)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Télécharger
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewVersions(file)}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFileToDelete(file)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uploader des fichiers</DialogTitle>
            <DialogDescription>
              Ajoutez des documents Word, RTF, PDF ou des images au projet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Fichiers</Label>
              <Input
                type="file"
                multiple
                onChange={handleFileSelect}
                accept=".doc,.docx,.rtf,.pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.svg,.zip"
              />
              {uploadFiles.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {uploadFiles.length} fichier(s) sélectionné(s)
                </p>
              )}
            </div>

            <div>
              <Label>Catégorie</Label>
              <Select
                value={uploadCategory}
                onValueChange={(v) => setUploadCategory(v as FileCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">Document (Word, RTF)</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="reference">Référence</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description (optionnel)</Label>
              <Textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Description des fichiers..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleUpload} disabled={uploadFiles.length === 0 || isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Upload en cours...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Uploader
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versions Dialog */}
      <Dialog open={showVersionsDialog} onOpenChange={setShowVersionsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historique des versions</DialogTitle>
            <DialogDescription>
              {selectedFile?.original_filename}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {versions.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">Version {version.version}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(version.uploaded_at)} par {version.uploader_name}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(version)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <div className="flex-1">
              <Input
                type="file"
                id="new-version"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && selectedFile) {
                    handleUploadNewVersion(selectedFile, file);
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('new-version')?.click()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Nouvelle version
              </Button>
            </div>
            <Button variant="outline" onClick={() => setShowVersionsDialog(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!fileToDelete} onOpenChange={() => setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le fichier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le fichier &quot;{fileToDelete?.original_filename}&quot;
              sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
