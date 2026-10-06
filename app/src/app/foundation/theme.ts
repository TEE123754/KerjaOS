export type WorkspaceTheme='light'|'dark';
export function readTheme():WorkspaceTheme{
 try{const saved=localStorage.getItem('kerjaos-theme');return saved==='dark'||saved==='luna'?'dark':'light'}catch{return 'light'}
}
export function persistTheme(theme:WorkspaceTheme){try{localStorage.setItem('kerjaos-theme',theme)}catch{/* Appearance is optional when storage is unavailable. */}}
