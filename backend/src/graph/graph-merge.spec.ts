import type {
  EngineLearnedGraph,
  EngineOperationResult,
  EngineStaticGraph,
} from '../engine/engine.service';
import { mergeGraph } from './graph-merge';

function node(operationId: string, method = 'GET', path = `/${operationId}`) {
  return {
    operationId,
    method,
    path,
    summary: null,
    parameters: [],
    hasRequestBody: false,
  };
}

/** consumer needs `param`, producer supplies `producedBy`. */
function edge(
  consumer: string,
  producer: string,
  param = 'id|path',
  producedBy = 'id',
) {
  return {
    consumer,
    producer,
    tentative: false,
    maxSimilarity: 1,
    matches: [
      {
        param,
        paramIn: 'params',
        producedBy,
        producedIn: 'response',
        similarity: 1,
      },
    ],
  };
}

/** Build the six-deep Q-table shape for a single learned dependency. */
function learned(
  consumer: string,
  producer: string,
  q: number,
  param = 'id|path',
  producedBy = 'id',
): EngineLearnedGraph {
  return {
    specName: 'test',
    dependenciesDiscovered: 1,
    table: {
      [consumer]: {
        params: {
          [param]: { [producer]: { response: { [producedBy]: q } } },
        },
      },
    },
  };
}

const STATIC: EngineStaticGraph = {
  specName: 'test',
  nodes: [node('getUsers'), node('createUser', 'POST'), node('getUserById')],
  edges: [edge('getUserById', 'getUsers'), edge('getUserById', 'createUser')],
};

describe('mergeGraph', () => {
  describe('edge direction', () => {
    it('emits producer as `from` and consumer as `to`', () => {
      // The engine stores the edge on the operation that NEEDS the value. If
      // this flip regresses, every graph in the UI reads backwards.
      const graph = mergeGraph({ staticGraph: STATIC });
      const e = graph.edges.find((x) => x.from === 'getUsers');
      expect(e).toBeDefined();
      expect(e!.to).toBe('getUserById');
    });
  });

  describe('edge kinds', () => {
    it('is predicted when there is no learned table at all', () => {
      const graph = mergeGraph({ staticGraph: STATIC });
      expect(graph.edges.every((e) => e.kind === 'predicted')).toBe(true);
      expect(graph.edges.every((e) => e.maxQ === null)).toBe(true);
    });

    it('is confirmed for a positive Q-value', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0.8),
      });
      const e = graph.edges.find((x) => x.from === 'getUsers')!;
      expect(e.kind).toBe('confirmed');
      expect(e.maxQ).toBe(0.8);
    });

    it('is penalized for a negative Q-value', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', -0.4),
      });
      expect(graph.edges.find((x) => x.from === 'getUsers')!.kind).toBe(
        'penalized',
      );
    });

    it('is predicted when the agent recorded an exact zero', () => {
      // A zero means the candidate was never actually tried, which is what a
      // purely semantic edge already says.
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0),
      });
      expect(graph.edges.find((x) => x.from === 'getUsers')!.kind).toBe(
        'predicted',
      );
    });

    it('is discovered when the pair exists only in the Q-table', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('createUser', 'getUsers', 0.5, 'email', 'email'),
      });
      const e = graph.edges.find(
        (x) => x.from === 'getUsers' && x.to === 'createUser',
      );
      expect(e).toBeDefined();
      expect(e!.kind).toBe('discovered');
      // Nothing proposed it semantically, so there is no similarity to report.
      expect(e!.maxSimilarity).toBeNull();
    });

    it('drops a discovered edge naming an operation the graph does not have', () => {
      // The Q-table can name an operation absent from the static node list;
      // drawing an edge to a node that isn't rendered would break the layout.
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('ghostOperation', 'getUsers', 0.5),
      });
      expect(graph.edges.some((e) => e.to === 'ghostOperation')).toBe(false);
    });
  });

  describe('matches', () => {
    it('joins the Q-value onto the matching parameter and field', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0.75),
      });
      const e = graph.edges.find((x) => x.from === 'getUsers')!;
      expect(e.matches[0]).toMatchObject({
        param: 'id|path',
        producedBy: 'id',
        similarity: 1,
        q: 0.75,
      });
    });

    it('leaves q null on a match the agent never touched', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0.75),
      });
      // The createUser edge has no learned entry of its own.
      const e = graph.edges.find((x) => x.from === 'createUser')!;
      expect(e.matches[0].q).toBeNull();
    });

    it('does not join a Q-value onto a different producing field', () => {
      // Same parameter, different source field — a real distinction, since one
      // producer can supply a parameter from several of its response fields.
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0.9, 'id|path', 'userId'),
      });
      const e = graph.edges.find((x) => x.from === 'getUsers')!;
      expect(e.matches[0].q).toBeNull();
      expect(e.kind).toBe('predicted');
    });
  });

  describe('run mode', () => {
    const operations: EngineOperationResult[] = [
      {
        operationId: 'getUsers',
        method: 'GET',
        path: '/getUsers',
        statusCodes: { '200': 5 },
        totalRequests: 5,
        passed: true,
        serverErrors: [],
      },
      {
        operationId: 'createUser',
        method: 'POST',
        path: '/createUser',
        statusCodes: { '500': 2 },
        totalRequests: 2,
        passed: false,
        serverErrors: [{ message: 'boom' }],
      },
    ];

    it('marks the graph as run-derived and attaches per-node outcomes', () => {
      const graph = mergeGraph({ staticGraph: STATIC, operations });
      expect(graph.source).toBe('run');

      const created = graph.nodes.find((n) => n.id === 'createUser')!;
      expect(created.statusCodes).toEqual({ '500': 2 });
      expect(created.hasServerErrors).toBe(true);

      // An operation with no traffic gets no run fields rather than zeroes,
      // so the UI can tell "never called" from "called and passed".
      expect(
        graph.nodes.find((n) => n.id === 'getUserById')!.statusCodes,
      ).toBeUndefined();
    });

    it('is spec-derived when no operations are supplied', () => {
      expect(mergeGraph({ staticGraph: STATIC }).source).toBe('spec');
    });
  });

  describe('stats', () => {
    it('counts kinds, entry points and the most depended-upon operation', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0.8),
      });
      expect(graph.stats).toMatchObject({
        operations: 3,
        dependencies: 2,
        confirmed: 1,
        predicted: 1,
        isolated: 0,
      });
      // Only getUserById depends on anything, so the other two can start a run.
      expect(graph.stats.entryPoints.sort()).toEqual([
        'createUser',
        'getUsers',
      ]);
      expect(graph.stats.mostDependedUpon!.count).toBe(1);
    });

    it('counts an operation with no edges either way as isolated', () => {
      const graph = mergeGraph({
        staticGraph: { ...STATIC, nodes: [...STATIC.nodes, node('getHealth')] },
      });
      expect(graph.stats.isolated).toBe(1);
    });
  });

  describe('truncation', () => {
    it('keeps learned edges and drops predicted ones when over the cap', () => {
      // 1700 operations in a chain: more edges than the cap, so pruning runs.
      const nodes = Array.from({ length: 1700 }, (_, i) => node(`op${i}`));
      const edges = nodes
        .slice(1)
        .map((_, i) => edge(`op${i + 1}`, `op${i}`, `p${i}`, `f${i}`));
      const graph = mergeGraph({
        staticGraph: { specName: 't', nodes, edges },
        learned: learned('op1', 'op0', 0.9, 'p0', 'f0'),
      });

      expect(graph.truncated).toBe(true);
      expect(graph.edges.length).toBe(1500);
      // The one edge the agent actually learned about must survive the cull.
      expect(
        graph.edges.some((e) => e.from === 'op0' && e.kind === 'confirmed'),
      ).toBe(true);
    });

    it('does not mark a small graph as truncated', () => {
      expect(mergeGraph({ staticGraph: STATIC }).truncated).toBe(false);
    });
  });

  it('handles a missing static graph without throwing', () => {
    const graph = mergeGraph({ staticGraph: null });
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.stats.operations).toBe(0);
  });
});
