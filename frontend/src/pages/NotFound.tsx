import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-8">
      <div className="text-center">
        <AlertCircle className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
        <h1 className="mb-2 text-4xl font-semibold text-foreground">404</h1>
        <p className="mb-6 text-muted-foreground">Page not found</p>
        <Button type="button" onClick={() => navigate('/')}>
          Back to hiring batches
        </Button>
      </div>
    </div>
  );
}
