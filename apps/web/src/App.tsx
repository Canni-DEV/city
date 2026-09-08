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
const AnimationLabPage = import.meta.env.DEV
  ? lazy(() =>
      import("./pages/AnimationLabPage").then((module) => ({
        default: module.AnimationLabPage,
      })),
    )
  : null;

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="City">
          <Building2 aria-hidden="true" />
          <span>City</span>
          <small>sandbox</small>
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
          {AnimationLabPage && (
            <Route
              path="/dev/animations"
              element={
                <Suspense fallback={<p className="route-loading">Loading animation lab…</p>}>
                  <AnimationLabPage />
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
