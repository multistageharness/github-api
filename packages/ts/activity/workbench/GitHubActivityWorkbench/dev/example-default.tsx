import { GitHubActivityWorkbench } from '../src';

/**
 * Happy path (route `/`). The workbench against the public GitHub API. Paste a
 * PAT in the top bar to exercise authenticated capabilities.
 */
export default function ExampleDefault() {
  return <GitHubActivityWorkbench />;
}
