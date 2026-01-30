'use client';

import { useState, useEffect } from 'react';
import { projectsApi } from '@/lib/api/projects';
import { publishersApi } from '@/lib/api/publishers';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Loader2 } from 'lucide-react';
import type { Publisher } from '@/types';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await projectsApi.create({
        title: formData.title,
        isbn: formData.isbn || undefined,
        description: formData.description || undefined,
        total_pages: parseInt(formData.total_pages) || 1,
        publisher_id: formData.publisher_id ? parseInt(formData.publisher_id) : undefined,
        width_mm: formData.width_mm ? parseInt(formData.width_mm) : undefined,
        height_mm: formData.height_mm ? parseInt(formData.height_mm) : undefined,
      });
      toast.success('Projet créé avec succès');
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
                  <SelectItem value="">Aucune</SelectItem>
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
