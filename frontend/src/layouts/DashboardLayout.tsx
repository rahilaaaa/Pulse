
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { user, activeCompany, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">P</div>
          <span>Pulse</span>
        </div>

        <div className="workspace-info">
          <small>WORKSPACE</small>
          <strong>{activeCompany?.name || "Select workspace"}</strong>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard">Overview</NavLink>
          <NavLink to="/companies">Switch company</NavLink>
          <NavLink to="/modules">Modules</NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-info">
            <strong>
              {user?.first_name} {user?.last_name}
            </strong>
            <small>{user?.email}</small>
          </div>

          <button className="logout-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span>{activeCompany?.name || "Pulse Workspace"}</span>
          <span>{user?.email}</span>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
}