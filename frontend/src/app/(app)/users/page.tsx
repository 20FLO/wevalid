'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { usersApi, UsersFilters, CreateUserData, UpdateUserData } from '@/lib/api/users';
import { publishersApi } from '@/lib/api/publishers';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { toast } from 'sonner';
import {
  Search,
  Users,
  MoreHorizontal,
  UserCheck,
  UserX,
  Shield,
  Mail,
  Plus,
  Pencil,
  Trash2,
  Building2,
} from 'lucide-react';
import type { User, UserRole, Publisher } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  editeur: 'Éditeur',
  fabricant: 'Fabricant',
  graphiste: 'Graphiste',
  auteur: 'Auteur',
  photograveur: 'Photograveur',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800',
  editeur: 'bg-blue-100 text-blue-800',
  fabricant: 'bg-purple-100 text-purple-800',
  graphiste: 'bg-green-100 text-green-800',
  auteur: 'bg-orange-100 text-orange-800',
  photograveur: 'bg-cyan-100 text-cyan-800',
};

const ALL_ROLES: UserRole[] = ['admin', 'editeur', 'fabricant', 'graphiste', 'auteur', 'photograveur'];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPublisherDialog, setShowPublisherDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<{
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role: UserRole;
  }>({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'auteur',
  });

  const [selectedPublisherId, setSelectedPublisherId] = useState<string>('');

  // Check admin access
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'editeur' && currentUser.role !== 'fabricant') {
      router.push('/dashboard');
    }
  }, [currentUser, router]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: UsersFilters = {};
      if (search) filters.search = search;
      if (roleFilter !== 'all') filters.role = roleFilter;

      const response = await usersApi.getAll(filters);
      setUsers(response.users);
    } catch (error) {
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter]);

  // Fetch publishers
  const fetchPublishers = useCallback(async () => {
    try {
      const response = await publishersApi.getAll();
      setPublishers(response.publishers);
    } catch (error) {
      console.error('Erreur lors du chargement des maisons d\'édition:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchPublishers();
  }, [fetchUsers, fetchPublishers]);

  // Reset form
  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      first_name: '',
      last_name: '',
      role: 'auteur',
    });
  };

  // Create user
  const handleCreate = async () => {
    if (!formData.email || !formData.password || !formData.first_name || !formData.last_name) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setIsSubmitting(true);
    try {
      await usersApi.create(formData as CreateUserData);
      toast.success('Utilisateur créé avec succès');
      setShowCreateDialog(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update user
  const handleUpdate = async () => {
    if (!selectedUser) return;

    const updateData: UpdateUserData = {};
    if (formData.email && formData.email !== selectedUser.email) updateData.email = formData.email;
    if (formData.first_name && formData.first_name !== selectedUser.first_name) updateData.first_name = formData.first_name;
    if (formData.last_name && formData.last_name !== selectedUser.last_name) updateData.last_name = formData.last_name;
    if (formData.role && formData.role !== selectedUser.role) updateData.role = formData.role;
    if (formData.password) updateData.password = formData.password;

    if (Object.keys(updateData).length === 0) {
      toast.info('Aucune modification détectée');
      return;
    }

    setIsSubmitting(true);
    try {
      await usersApi.update(selectedUser.id, updateData);
      toast.success('Utilisateur modifié avec succès');
      setShowEditDialog(false);
      setSelectedUser(null);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la modification');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle user status
  const handleToggleStatus = async () => {
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      await usersApi.setStatus(selectedUser.id, !selectedUser.is_active);
      toast.success(
        selectedUser.is_active
          ? 'Utilisateur désactivé'
          : 'Utilisateur activé'
      );
      setShowStatusDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la mise à jour');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete user
  const handleDelete = async () => {
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      await usersApi.delete(selectedUser.id);
      toast.success('Utilisateur supprimé');
      setShowDeleteDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la suppression');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Assign to publisher
  const handleAssignPublisher = async () => {
    if (!selectedUser || !selectedPublisherId) return;

    setIsSubmitting(true);
    try {
      await publishersApi.addMember(parseInt(selectedPublisherId), selectedUser.id, 'member');
      toast.success('Utilisateur assigné à la maison d\'édition');
      setShowPublisherDialog(false);
      setSelectedUser(null);
      setSelectedPublisherId('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'assignation');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open dialogs
  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      password: '',
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    });
    setShowEditDialog(true);
  };

  const openStatusDialog = (user: User) => {
    setSelectedUser(user);
    setShowStatusDialog(true);
  };

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  const openPublisherDialog = (user: User) => {
    setSelectedUser(user);
    setSelectedPublisherId('');
    setShowPublisherDialog(true);
  };

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'editeur' && currentUser.role !== 'fabricant')) {
    return null;
  }

  const isAdmin = currentUser.role === 'admin';

  return (
    <>
      <Header title="Utilisateurs" description="Gérez les utilisateurs de la plateforme" />

      <main className="flex-1 space-y-6 p-6">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un utilisateur..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Tous les rôles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Nouvel utilisateur
            </Button>
          )}
        </div>

        {/* Users table */}
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : users.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Dernière connexion</TableHead>
                    {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <span className="text-sm font-medium">
                              {user.first_name[0]}{user.last_name[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">
                              {user.first_name} {user.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={ROLE_COLORS[user.role]}>
                          <Shield className="mr-1 h-3 w-3" />
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <UserCheck className="mr-1 h-3 w-3" />
                            Actif
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-600">
                            <UserX className="mr-1 h-3 w-3" />
                            Inactif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.last_login
                          ? new Date(user.last_login).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Jamais'}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {user.id !== currentUser.id && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Modifier
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openPublisherDialog(user)}>
                                  <Building2 className="mr-2 h-4 w-4" />
                                  Assigner à une maison
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openStatusDialog(user)}>
                                  {user.is_active ? (
                                    <>
                                      <UserX className="mr-2 h-4 w-4" />
                                      Désactiver
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="mr-2 h-4 w-4" />
                                      Activer
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(user)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Supprimer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Aucun utilisateur trouvé</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || roleFilter !== 'all'
                  ? 'Essayez de modifier vos filtres'
                  : 'Aucun utilisateur dans le système'}
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel utilisateur</DialogTitle>
            <DialogDescription>
              Créez un nouvel utilisateur pour la plateforme.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rôle</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
            <DialogDescription>
              Modifiez les informations de {selectedUser?.first_name} {selectedUser?.last_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_first_name">Prénom</Label>
                <Input
                  id="edit_first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_last_name">Nom</Label>
                <Input
                  id="edit_last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_password">Nouveau mot de passe (optionnel)</Label>
              <Input
                id="edit_password"
                type="password"
                placeholder="Laisser vide pour ne pas changer"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_role">Rôle</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleUpdate} disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign to Publisher Dialog */}
      <Dialog open={showPublisherDialog} onOpenChange={setShowPublisherDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assigner à une maison d&apos;édition</DialogTitle>
            <DialogDescription>
              Assignez {selectedUser?.first_name} {selectedUser?.last_name} à une maison d&apos;édition.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label>Maison d&apos;édition</Label>
              <Select value={selectedPublisherId} onValueChange={setSelectedPublisherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une maison d'édition" />
                </SelectTrigger>
                <SelectContent>
                  {publishers.map((publisher) => (
                    <SelectItem key={publisher.id} value={publisher.id.toString()}>
                      {publisher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublisherDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAssignPublisher} disabled={isSubmitting || !selectedPublisherId}>
              {isSubmitting ? 'Assignation...' : 'Assigner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Toggle Dialog */}
      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.is_active ? 'Désactiver' : 'Activer'} l&apos;utilisateur ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.is_active
                ? `${selectedUser?.first_name} ${selectedUser?.last_name} ne pourra plus se connecter à la plateforme.`
                : `${selectedUser?.first_name} ${selectedUser?.last_name} pourra à nouveau se connecter à la plateforme.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleStatus}
              className={selectedUser?.is_active ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {selectedUser?.is_active ? 'Désactiver' : 'Activer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. {selectedUser?.first_name} {selectedUser?.last_name} sera
              définitivement supprimé de la plateforme.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
