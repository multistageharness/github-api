import { FeatureFlagProvider, GitHubActivityWorkbench } from '../src';

/**
 * Flag-off state (route `/flagged-off`). A provider resolves every flag to
 * false, so the organism renders its `featureFlagFallback` — the floor of the
 * degradation ladder — instead of the workbench.
 */
export default function ExampleFlaggedOff() {
  return (
    <FeatureFlagProvider resolver={() => false}>
      <div className="flex h-full items-center justify-center bg-slate-50">
        <GitHubActivityWorkbench
          featureFlag="workbench"
          featureFlagFallback={
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-700">Workbench hidden</p>
              <p className="mt-1 text-xs text-slate-400">
                The <code>workbench</code> feature flag resolved to false.
              </p>
            </div>
          }
        />
      </div>
    </FeatureFlagProvider>
  );
}
