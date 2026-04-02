import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

/** App shell with navigation and account menu (inside RequireAuth). */
export function Layout() {
  const navigate = useNavigate();
  const { user, logout, canManageUsers } = useAuth();
  const roleLabel = user?.role === 'hiring_manager' ? 'Hiring manager' : 'Interviewer';

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight text-foreground hover:opacity-90">
            AA&amp;AI Hiring Workspace
          </Link>
          <nav className="flex flex-wrap items-center gap-2 sm:gap-4">
            {canManageUsers ? (
              <Link
                to="/admin/users"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Team &amp; roles
              </Link>
            ) : null}
            {user ? (
              <>
                <span
                  className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:inline"
                  title={`${user.name} · ${user.email}`}
                >
                  {user.name || user.email}
                </span>
                <Badge variant="outline" className="text-xs capitalize">
                  {roleLabel}
                </Badge>
                <Button variant="ghost" size="sm" type="button" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
