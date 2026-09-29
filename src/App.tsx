import { AppShell } from './app/AppShell';
import { PermissionsProvider } from './app/PermissionsProvider';
import { RegionProvider } from './app/RegionProvider';

export default function App() {
  return (
    <RegionProvider>
      <PermissionsProvider>
        <AppShell />
      </PermissionsProvider>
    </RegionProvider>
  );
}
