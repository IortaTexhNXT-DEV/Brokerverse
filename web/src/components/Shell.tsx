import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { MODULES } from '@brokerverse/shared';
import { useAuth } from '../auth';

export function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return null;
  const visible = MODULES.filter((m) => user.modules.includes(m.code));
  const groups = Array.from(new Set(visible.map((m) => m.group)));
  const initials = user.fullName.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="brand">
          <img src="/bdo-insure.svg" alt="BDO Insure" />
          <span className="sep" />
          <NavLink to="/" className="product" style={{ textDecoration: 'none' }}>Broker<span>Verse</span></NavLink>
          <span className="sep" />
          <span className="delivered">delivered by <img src="/iorta-technxt-logo.png" alt="iorta TechNXT" /></span>
        </div>
        <div className="who">
          <div><b>{user.fullName}</b>{user.roleCode.replace(/_/g, ' ')} · {user.department || '—'}</div>
          <div className="av" title={user.username}>{initials}</div>
          <button className="btn sm" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
        </div>
      </header>
      <nav className="sidebar" aria-label="Modules">
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><span className="code">HOME</span>Dashboard</NavLink>
        {groups.map((g) => (
          <div key={g}>
            <div className="nav-group">{g}</div>
            {visible.filter((m) => m.group === g).map((m) => (
              <NavLink key={m.code} to={m.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><span className="code">{m.code}</span>{m.name}</NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main className="main"><Outlet /></main>
      <footer className="app-foot"><span>BDO Insurance &amp; Reinsurance Brokers, Inc. · BrokerVerse core broking platform · Confidential</span><span>Delivered by iorta TechNXT · www.iortatechnxt.com</span></footer>
    </div>
  );
}
