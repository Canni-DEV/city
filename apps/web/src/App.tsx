import { Boxes, Building2, LibraryBig } from "lucide-react";
import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { CityPage } from "./pages/CityPage";
import { CreditsPage } from "./pages/CreditsPage";
import { LibraryPage } from "./pages/LibraryPage";

const AssetViewerPage = import.meta.env.DEV
  ? lazy(() =>
      import("./pages/AssetViewerPage").then((module) => ({ default: module.AssetViewerPage })),
    )
  : null;

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="City library">
          <Building2 aria-hidden="true" />
          <span>City</span>
          <small>procedural sandbox</small>
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavLink to="/">
            <LibraryBig aria-hidden="true" /> Library
          </NavLink>
          {import.meta.env.DEV && (
            <NavLink to="/dev/assets">
              <Boxes aria-hidden="true" /> Assets
            </NavLink>
          )}
          <NavLink to="/credits">Credits</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/city/:cityId" element={<CityPage />} />
          <Route path="/credits" element={<CreditsPage />} />
          {AssetViewerPage && (
            <Route
              path="/dev/assets"
              element={
                <Suspense fallback={<p className="route-loading">Loading asset catalog…</p>}>
                  <AssetViewerPage />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
