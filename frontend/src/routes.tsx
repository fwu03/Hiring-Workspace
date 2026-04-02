import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { HiringBatches } from './hiring/components/HiringBatches';
import { BatchDetail } from './hiring/components/BatchDetail';
import { HiringInterviewWorkspace } from './hiring/components/HiringInterviewWorkspace';
import { NotFound } from './pages/NotFound';
import { LoginPage } from './pages/Login';
import { UserManagement } from './pages/UserManagement';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HiringBatches /> },
      { path: 'batches/:batchId', element: <BatchDetail /> },
      { path: 'batches/:batchId/workspace/:candidateId', element: <HiringInterviewWorkspace /> },
      { path: 'admin/users', element: <UserManagement /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
