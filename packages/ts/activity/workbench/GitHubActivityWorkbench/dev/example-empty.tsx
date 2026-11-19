import { GitHubActivityWorkbench } from '../src';

/**
 * Empty / pristine state (route `/empty`). Before any request is sent the
 * response panel shows its typed empty-state ("No response yet") — the resting
 * rung of the degradation ladder. This page exists to exercise that state.
 */
export default function ExampleEmpty() {
  return <GitHubActivityWorkbench initialBaseUrl="https://api.github.com" />;
}
