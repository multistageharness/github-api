import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import './styles.css';

import ExampleDefault from './example-default';
import ExampleEmpty from './example-empty';
import ExampleFlaggedOff from './example-flagged-off';

const EXAMPLES = [
  { name: 'Default', path: '/' },
  { name: 'Empty', path: '/empty' },
  { name: 'Flagged off', path: '/flagged-off' },
];

function DevNav() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-4 right-4 z-50 flex flex-col gap-1 rounded-lg bg-white p-2 shadow-lg ring-1 ring-slate-200">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Examples
      </div>
      {EXAMPLES.map((e) => (
        <Link
          key={e.path}
          to={e.path}
          className={
            'rounded px-2 py-1 text-xs ' +
            (loc.pathname === e.path ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100')
          }
        >
          {e.name}
        </Link>
      ))}
    </nav>
  );
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <DevNav />
    <Routes>
      <Route path="/" element={<ExampleDefault />} />
      <Route path="/empty" element={<ExampleEmpty />} />
      <Route path="/flagged-off" element={<ExampleFlaggedOff />} />
    </Routes>
  </BrowserRouter>,
);
