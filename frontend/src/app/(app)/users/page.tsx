'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { usersApi, UsersFilters } from '@/lib/api/users';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
} from 'lucide-react';
import type { User, UserRole } from '@/types';

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

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Dialog states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Toggle user status
  const handleToggleStatus = async () => {
    if (!selectedUser) return;

    setIsUpdating(true);
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
      setIsUpdating(false);
    }
  };

  // Open status dialog
  const openStatusDialog = (user: User) => {
    setSelectedUser(user);
    setShowStatusDialog(true);
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
        <div className="flex flex-col gap-4 sm:flex-row">
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
    </>
  );
}
