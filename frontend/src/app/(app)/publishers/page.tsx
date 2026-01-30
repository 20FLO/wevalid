'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { publishersApi } from '@/lib/api/publishers';
import { usersApi } from '@/lib/api/users';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  Building2,
  Users,
  FolderKanban,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  Loader2,
} from 'lucide-react';
import type { Publisher, PublisherMember, User } from '@/types';

export default function PublishersPage() {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);

  // Selected publisher for operations
  const [selectedPublisher, setSelectedPublisher] = useState<Publisher | null>(null);
  const [publisherMembers, setPublisherMembers] = useState<PublisherMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedMemberRole, setSelectedMemberRole] = useState<'admin' | 'member'>('member');

  // Form state
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check admin access
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'fabricant') {
      router.push('/dashboard');
    }
  }, [user, router]);

  // Fetch publishers
  const fetchPublishers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await publishersApi.getAll(search || undefined);
      setPublishers(response.publishers);
    } catch (error) {
      toast.error('Erreur lors du chargement des maisons d\'édition');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchPublishers();
  }, [fetchPublishers]);

  // Create publisher
  const handleCreate = async () => {
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      await publishersApi.create({
        name: formData.name,
        description: formData.description || undefined,
      });
      toast.success('Maison d\'édition créée');
      setShowCreateDialog(false);
      setFormData({ name: '', description: '' });
      fetchPublishers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update publisher
  const handleUpdate = async () => {
    if (!selectedPublisher || !formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      await publishersApi.update(selectedPublisher.id, {
        name: formData.name,
        description: formData.description || undefined,
      });
      toast.success('Maison d\'édition mise à jour');
      setShowEditDialog(false);
      setSelectedPublisher(null);
      setFormData({ name: '', description: '' });
      fetchPublishers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la mise à jour');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete publisher
  const handleDelete = async () => {
    if (!selectedPublisher) return;

    setIsSubmitting(true);
    try {
      await publishersApi.delete(selectedPublisher.id);
      toast.success('Maison d\'édition supprimée');
      setShowDeleteDialog(false);
      setSelectedPublisher(null);
      fetchPublishers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la suppression');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (publisher: Publisher) => {
    setSelectedPublisher(publisher);
    setFormData({ name: publisher.name, description: publisher.description || '' });
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (publisher: Publisher) => {
    setSelectedPublisher(publisher);
    setShowDeleteDialog(true);
  };

  // Open members dialog
  const openMembersDialog = async (publisher: Publisher) => {
    setSelectedPublisher(publisher);
    setShowMembersDialog(true);
    try {
      const response = await publishersApi.getById(publisher.id);
      setPublisherMembers(response.publisher.members || []);
    } catch (error) {
      toast.error('Erreur lors du chargement des membres');
    }
  };

  // Open add member dialog
  const openAddMemberDialog = async () => {
    setShowAddMemberDialog(true);
    try {
      const response = await usersApi.getAll();
      // Filter out users already in the publisher
      const existingIds = publisherMembers.map((m) => m.id);
      setAllUsers(response.users.filter((u) => !existingIds.includes(u.id)));
    } catch (error) {
      toast.error('Erreur lors du chargement des utilisateurs');
    }
  };

  // Add member
  const handleAddMember = async () => {
    if (!selectedPublisher || !selectedUserId) return;

    setIsSubmitting(true);
    try {
      await publishersApi.addMember(selectedPublisher.id, parseInt(selectedUserId), selectedMemberRole);
      toast.success('Membre ajouté');
      setShowAddMemberDialog(false);
      setSelectedUserId('');
      // Refresh members
      const response = await publishersApi.getById(selectedPublisher.id);
      setPublisherMembers(response.publisher.members || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'ajout');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove member
  const handleRemoveMember = async (userId: number) => {
    if (!selectedPublisher) return;

    try {
      await publishersApi.removeMember(selectedPublisher.id, userId);
      toast.success('Membre retiré');
      // Refresh members
      const response = await publishersApi.getById(selectedPublisher.id);
      setPublisherMembers(response.publisher.members || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la suppression');
    }
  };

  if (!user || (user.role !== 'admin' && user.role !== 'fabricant')) {
    return null;
  }

  const isAdmin = user.role === 'admin';

  return (
    <>
      <Header title="Maisons d'édition" description="Gérez les maisons d'édition et leurs membres">
        {isAdmin && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle maison
          </Button>
        )}
      </Header>

      <main className="flex-1 space-y-6 p-6">
        {/* Search */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher une maison d'édition..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Publishers list */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                  <Skeleton className="mt-4 h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : publishers.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {publishers.map((publisher) => (
              <Card key={publisher.id} className="group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{publisher.name}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {publisher.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {publisher.description}
                    </p>
                  )}

                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{publisher.members_count || 0} membres</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FolderKanban className="h-4 w-4" />
                      <span>{publisher.projects_count || 0} projets</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openMembersDialog(publisher)}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Membres
                    </Button>
                    {isAdmin && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEditDialog(publisher)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-destructive"
                          onClick={() => openDeleteDialog(publisher)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Aucune maison d&apos;édition</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search ? 'Aucun résultat pour cette recherche' : 'Créez votre première maison d\'édition'}
              </p>
              {isAdmin && !search && (
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Créer une maison
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle maison d&apos;édition</DialogTitle>
            <DialogDescription>
              Créez une nouvelle maison d&apos;édition pour regrouper vos projets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom *</Label>
              <Input
                id="name"
                placeholder="Éditions Dupont"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Description de la maison d'édition..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!formData.name.trim() || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la maison d&apos;édition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.name.trim() || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la maison d&apos;édition ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Tous les projets associés seront détachés de cette maison.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Members Dialog */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Membres de {selectedPublisher?.name}</DialogTitle>
            <DialogDescription>
              Gérez les membres de cette maison d&apos;édition.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {publisherMembers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {publisherMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.first_name} {member.last_name}
                      </TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.publisher_role}</Badge>
                      </TableCell>
                      <TableCell>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-4">Aucun membre</p>
            )}
          </div>
          <DialogFooter>
            {isAdmin && (
              <Button onClick={openAddMemberDialog}>
                <UserPlus className="mr-2 h-4 w-4" />
                Ajouter un membre
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un membre</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Utilisateur</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un utilisateur" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.first_name} {u.last_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rôle dans la maison</Label>
              <Select value={selectedMemberRole} onValueChange={(v) => setSelectedMemberRole(v as 'admin' | 'member')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membre</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddMember} disabled={!selectedUserId || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
