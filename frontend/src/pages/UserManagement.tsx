import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Shield } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../auth/AuthContext';
import {
  listUsers,
  patchUser,
  registerUser,
  type AuthUser,
  type UserRole,
} from '../auth/authApi';

const ROLE_LABELS: Record<UserRole, string> = {
  hiring_manager: 'Hiring manager',
  interviewer: 'Interviewer',
};

export function UserManagement() {
  const navigate = useNavigate();
  const { canManageUsers, user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('interviewer');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageUsers) void refresh();
  }, [canManageUsers, refresh]);

  const handleRoleChange = async (userId: string, role: UserRole) => {
    try {
      const updated = await patchUser(userId, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not update role');
    }
  };

  const handlePatchDisplayName = async (userId: string, nextName: string) => {
    const prev = users.find((u) => u.id === userId);
    if (!prev || nextName === prev.name) return;
    try {
      const updated = await patchUser(userId, { name: nextName });
      setUsers((list) => list.map((u) => (u.id === userId ? updated : u)));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not update name');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      window.alert('Enter the person’s display name.');
      return;
    }
    setCreating(true);
    try {
      await registerUser({ name: newName.trim(), email: newEmail.trim(), role: newRole });
      setNewName('');
      setNewEmail('');
      setNewRole('interviewer');
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not create user');
    } finally {
      setCreating(false);
    }
  };

  if (!canManageUsers) {
    return (
      <div className="min-h-full bg-background p-8">
        <p className="text-muted-foreground">You need hiring manager access to manage users.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background p-6 md:p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to batches
        </Link>
        <div className="mb-6 flex items-center gap-2">
          <Shield className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team &amp; roles</h1>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Add a user</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleCreateUser(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="nu-name" className="text-sm font-medium">
                    Display name
                  </label>
                  <Input
                    id="nu-name"
                    type="text"
                    autoComplete="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="nu-email" className="text-sm font-medium">
                    Work email
                  </label>
                  <Input
                    id="nu-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="nu-role" className="text-sm font-medium">
                  Role
                </label>
                <select
                  id="nu-role"
                  className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  <option value="interviewer">{ROLE_LABELS.interviewer}</option>
                  <option value="hiring_manager">{ROLE_LABELS.hiring_manager}</option>
                </select>
              </div>
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create user'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">People</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        className="max-w-md font-medium"
                        defaultValue={u.name}
                        key={`${u.id}-${u.name}`}
                        aria-label={`Display name for ${u.email}`}
                        onBlur={(e) => void handlePatchDisplayName(u.id, e.target.value.trim())}
                      />
                      <p className="truncate text-sm text-muted-foreground" title={u.email}>
                        {u.email}
                      </p>
                      {u.id === currentUser?.id ? (
                        <Badge variant="outline" className="text-xs">
                          You
                        </Badge>
                      ) : null}
                    </div>
                    <select
                      className="h-9 max-w-[220px] shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                      value={u.role}
                      onChange={(e) => void handleRoleChange(u.id, e.target.value as UserRole)}
                      aria-label={`Role for ${u.email}`}
                    >
                      {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
