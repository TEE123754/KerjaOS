import { Link } from 'react-router';
export function HiringManagerLogin(_props: {onAuthenticate: (user: {name: string; email: string; role: string}) => void}) {
  return <section><h1>Staff sign in</h1><p>Client-side demo accounts have been disabled. Use the server-authenticated workspace and MFA.</p><Link to="/foundation">Open secure workspace</Link></section>;
}
