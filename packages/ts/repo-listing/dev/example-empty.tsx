import { RepoListing } from '../src';

/** Empty state: no repositories supplied. Route `/empty`. */
export default function ExampleEmpty() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <RepoListing repos={[]} noDataMessage="No repositories to show yet." headingLevel={1} />
    </div>
  );
}
