import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { WorkspaceStartup } from '@/components/workspace-startup';
import { NetworkQualityNotificationBridge } from '@/components/network-quality-notification-bridge';

import './index.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <WorkspaceStartup><NetworkQualityNotificationBridge /><App /></WorkspaceStartup>
  </ErrorBoundary>,
);
