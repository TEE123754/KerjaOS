import {BriefcaseBusiness, LayoutDashboard, Users} from 'lucide-react';

export type WorkspaceMode = 'Main Overview' | 'Management' | 'Recruitment';

export function WorkspaceModeHeader({mode, onChange, locale}: {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
  locale: 'en' | 'ms';
}) {
  const ms = locale === 'ms';
  return <header className="workspace-mode-header">
    <span className="workspace-mode-caption">KerjaOS <span>· {ms ? 'Ruang kerja' : 'Workspace'}</span></span>
    <nav aria-label={ms ? 'Mod ruang kerja' : 'Workspace modes'} className="workspace-mode-switch">
      <button type="button" aria-current={mode === 'Main Overview' ? 'page' : undefined}
        onClick={() => onChange('Main Overview')}>
        <LayoutDashboard size={16} aria-hidden="true"/>{ms ? 'Gambaran utama' : 'Main Overview'}
      </button>
      <button type="button" aria-current={mode === 'Management' ? 'page' : undefined}
        onClick={() => onChange('Management')}>
        <Users size={16} aria-hidden="true"/>{ms ? 'Pengurusan' : 'Management'}
      </button>
      <button type="button" aria-current={mode === 'Recruitment' ? 'page' : undefined}
        onClick={() => onChange('Recruitment')}>
        <BriefcaseBusiness size={16} aria-hidden="true"/>{ms ? 'Pengambilan' : 'Recruitment'}
      </button>
    </nav>
  </header>;
}
