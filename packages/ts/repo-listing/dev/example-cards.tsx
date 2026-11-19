import { RepoListing } from '../src';
import { SAMPLE_REPOS } from './sampleRepos';

/** Cards view variant. Route `/cards`. */
export default function ExampleCards() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <RepoListing
        repos={SAMPLE_REPOS}
        initialView="cards"
        title="Repositories (cards)"
        headingLevel={1}
      />
    </div>
  );
}
