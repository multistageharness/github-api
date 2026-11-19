import { RequestLine } from './RequestLine';

export default { title: 'Molecules/RequestLine', component: RequestLine };

export const Get = () => (
  <RequestLine method="GET" path="/repos/octocat/hello-world/events" qs="per_page=30" />
);

export const PostWithBody = () => (
  <RequestLine
    method="POST"
    path="/repos/octocat/hello-world/issues"
    hasBody
    body={{ title: 'Bug', labels: ['triage'] }}
    accept="application/vnd.github.v3+json"
  />
);

export const Hidden = () => (
  <RequestLine
    method="GET"
    path="/events"
    featureFlag="off"
    featureFlagFallback={<span>hidden</span>}
  />
);
