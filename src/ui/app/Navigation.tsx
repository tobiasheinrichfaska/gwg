import { WheelNav, areaNode, distributor, type PageTable } from 'rad-navi';
import { AuditScreen } from '../screens/audit/AuditScreen.tsx';
import { BackupScreen } from '../screens/backup/BackupScreen.tsx';
import { ClientsScreen } from '../screens/clients/ClientsScreen.tsx';
import { OverviewScreen } from '../screens/overview/OverviewScreen.tsx';
import { TasksScreen } from '../screens/tasks/TasksScreen.tsx';

const PAGES: PageTable = {
  uebersicht: { name: 'Übersicht' },
  mandanten: { name: 'Mandanten' },
  aufgaben: { name: 'Aufgaben' },
  audit: { name: 'Audit' },
  sicherung: { name: 'Sicherung' },
};

const TREE = distributor('wurzel', 'GwG-Pflege', [
  areaNode(PAGES, 'bereich-uebersicht', 'Übersicht', ['uebersicht']),
  areaNode(PAGES, 'bereich-mandanten', 'Mandanten', ['mandanten']),
  areaNode(PAGES, 'bereich-aufgaben', 'Aufgaben', ['aufgaben']),
  areaNode(PAGES, 'bereich-audit', 'Audit', ['audit']),
  areaNode(PAGES, 'bereich-sicherung', 'Sicherung', ['sicherung']),
]);

const SCREENS: Record<string, () => React.JSX.Element> = {
  uebersicht: OverviewScreen,
  mandanten: ClientsScreen,
  aufgaben: TasksScreen,
  audit: AuditScreen,
  sicherung: BackupScreen,
};

const TEXTS = {
  navigation: 'Hauptnavigation',
  path: 'Aktueller Pfad',
  jumpToTarget: 'Zum Ziel springen',
  planned: ' (geplant)',
  neighbour: (name: string) => `Zur Seite ${name}`,
  backTo: (name: string) => `Zurück zu ${name}`,
  placeholderPlanned: 'Noch nicht gebaut.',
  placeholder: (name: string) => `${name}: noch nicht gebaut.`,
  backButton: (name: string) => `Zurück zu ${name}`,
};

export function Navigation() {
  return (
    <WheelNav
      tree={TREE}
      pages={PAGES}
      pageFor={(page) => {
        const Screen = SCREENS[page];
        return Screen ? <Screen /> : undefined;
      }}
      texts={TEXTS}
    />
  );
}
