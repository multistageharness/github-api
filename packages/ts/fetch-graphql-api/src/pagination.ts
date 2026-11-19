/**
 * @fileoverview Cursor pagination over `pageInfo`/`endCursor` (R12).
 *
 * Structurally different from REST's `Link` header, which is why it is here and
 * not in the REST unit: the cursor is inside the response body, at whatever
 * depth the query put the connection, and the next request is the *same* query
 * with one variable changed.
 * @module pagination
 */

/** GitHub's connection cursor block. */
export interface PageInfo {
  hasNextPage?: boolean;
  endCursor?: string | null;
  hasPreviousPage?: boolean;
  startCursor?: string | null;
}

/** A located connection: its `pageInfo`, its `nodes`, and where in the response it was found. */
export interface LocatedConnection {
  pageInfo: PageInfo;
  /** `nodes`, or `edges[].node` when the query asked for edges. Empty when the query asked for neither. */
  nodes: unknown[];
  /** Dotted path to the connection within `data`, for diagnostics. */
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPageInfo(value: unknown): value is PageInfo {
  return isRecord(value) && ('hasNextPage' in value || 'endCursor' in value);
}

/**
 * Find the paginated connection in a GraphQL response.
 *
 * Breadth-first, so the shallowest connection wins when a query nests several —
 * which is the one a caller iterating the top level means. A query with two
 * connections at the same depth is ambiguous, and `connectionPath` is how a
 * caller resolves it.
 *
 * @param data - The `data` half of the envelope.
 * @param connectionPath - Dotted path to the connection, when the default would
 *   pick the wrong one.
 */
export function findConnection(data: unknown, connectionPath?: string): LocatedConnection | null {
  if (connectionPath !== undefined) {
    const node = readPath(data, connectionPath);
    if (!isRecord(node) || !isPageInfo(node['pageInfo'])) return null;
    return { pageInfo: node['pageInfo'], nodes: readNodes(node), path: connectionPath };
  }

  const queue: { value: unknown; path: string }[] = [{ value: data, path: '' }];
  while (queue.length > 0) {
    const current = queue.shift() as { value: unknown; path: string };
    if (!isRecord(current.value)) continue;

    if (isPageInfo(current.value['pageInfo'])) {
      return {
        pageInfo: current.value['pageInfo'] as PageInfo,
        nodes: readNodes(current.value),
        path: current.path,
      };
    }

    for (const [key, child] of Object.entries(current.value)) {
      const path = current.path === '' ? key : `${current.path}.${key}`;
      if (Array.isArray(child)) {
        child.forEach((entry, index) => queue.push({ value: entry, path: `${path}.${index}` }));
      } else if (isRecord(child)) {
        queue.push({ value: child, path });
      }
    }
  }
  return null;
}

/** Read `nodes`, falling back to `edges[].node` — GitHub's schema offers both. */
function readNodes(connection: Record<string, unknown>): unknown[] {
  const nodes = connection['nodes'];
  if (Array.isArray(nodes)) return nodes;

  const edges = connection['edges'];
  if (Array.isArray(edges)) {
    return edges.map((edge) => (isRecord(edge) ? edge['node'] : undefined));
  }
  return [];
}

/** Walk a dotted path, tolerating numeric indices into arrays. */
function readPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (segment === '') continue;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}
