import { RateLimitChips } from './RateLimitChips';

export default { title: 'Molecules/RateLimitChips', component: RateLimitChips };

export const Healthy = () => (
  <RateLimitChips
    rl={{ limit: '5000', remaining: '4980', reset: '1700000000', used: '20', resource: 'core' }}
  />
);

export const LowRemaining = () => (
  <RateLimitChips
    rl={{ limit: '5000', remaining: '3', reset: '1700000000', used: '4997', resource: 'core' }}
  />
);

export const Empty = () => <RateLimitChips rl={null} />;

export const Hidden = () => (
  <RateLimitChips
    rl={{ limit: '5000', remaining: '4980', reset: null, used: '20', resource: 'core' }}
    featureFlag="off"
    featureFlagFallback={<span>hidden</span>}
  />
);
