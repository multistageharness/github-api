import { RepoListing } from '../src';
import { SAMPLE_REPOS } from './sampleRepos';

/** Happy-path: full repo set, default (table) view. Route `/`. */
export default function ExampleDefault() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <RepoListing repos={SAMPLE_REPOS} headingLevel={1} />
    </div>
  );
}
