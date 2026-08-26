import type {
  EngineLearnedGraph,
  EngineOperationResult,
  EngineStaticGraph,
} from '../engine/engine.service';
import {
  GRAPH_SCHEMA,
  mergeGraph,
  upgradeStoredGraph,
  type DependencyGraph,
} from './graph-merge';

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
  similarity = 1,
  producedIn = 'response',
) {
  return {
    consumer,
    producer,
    tentative: false,
    maxSimilarity: similarity,
    matches: [
      {
        param,
        paramIn: 'params',
        producedBy,
        producedIn,
        similarity,
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

/**
 * Two independent dependencies, so both survive resolution: `getUserById`
 * takes its id from `getUsers` and its email from `createUser`. Give two
 * producers the *same* parameter instead and they compete — that is what the
 * `resolution` block below exercises.
 */
const STATIC: EngineStaticGraph = {
  specName: 'test',
  nodes: [node('getUsers'), node('createUser', 'POST'), node('getUserById')],
  edges: [
    edge('getUserById', 'getUsers'),
    edge('getUserById', 'createUser', 'email|query', 'email'),
  ],
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

  describe('resolution', () => {
    // The comparator proposes every plausible producer for every parameter,
    // which is quadratic and unreadable. The agent uses exactly one of them
    // per parameter (`DependencyAgent.get_best_action`), and that is what the
    // graph draws.
    const contested: EngineStaticGraph = {
      specName: 'test',
      nodes: [node('listA'), node('listB'), node('getThing')],
      edges: [
        edge('getThing', 'listA', 'id|path', 'id', 0.82),
        edge('getThing', 'listB', 'id|path', 'id', 0.97),
      ],
    };

    it('draws one edge per parameter, not one per candidate', () => {
      const graph = mergeGraph({ staticGraph: contested });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].from).toBe('listB');
      expect(graph.stats.candidates).toBe(2);
      expect(graph.stats.dependencies).toBe(1);
    });

    it('prefers the higher Q even when its similarity is lower', () => {
      // The agent compares Q and nothing else; an unexercised candidate sits
      // at zero, so a positive Q beats any similarity score.
      const graph = mergeGraph({
        staticGraph: contested,
        learned: learned('getThing', 'listA', 0.6),
      });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].from).toBe('listA');
      expect(graph.edges[0].kind).toBe('confirmed');
    });

    it('breaks a similarity tie toward a value the producer returns', () => {
      // Near every parameter on a real spec ties at maximum similarity, so
      // this tie-break is what decides the picture. A `params` match only says
      // two operations accept a similarly named argument; a `response` match
      // is an actual value handed from one operation to the next.
      const tied: EngineStaticGraph = {
        specName: 'test',
        nodes: [node('listA'), node('listB'), node('getThing')],
        edges: [
          edge('getThing', 'listA', 'id|path', 'id', 1, 'params'),
          edge('getThing', 'listB', 'id|path', 'id', 1, 'response'),
        ],
      };
      expect(mergeGraph({ staticGraph: tied }).edges[0].from).toBe('listB');
    });

    it('is stable across rebuilds when everything else ties', () => {
      const tied: EngineStaticGraph = {
        specName: 'test',
        nodes: [node('listZ'), node('listA'), node('getThing')],
        edges: [edge('getThing', 'listZ'), edge('getThing', 'listA')],
      };
      const reversed: EngineStaticGraph = {
        ...tied,
        edges: [...tied.edges].reverse(),
      };
      expect(mergeGraph({ staticGraph: tied }).edges[0].from).toBe('listA');
      expect(mergeGraph({ staticGraph: reversed }).edges[0].from).toBe('listA');
    });

    it('collapses several parameters of one pair into a single edge', () => {
      const wide: EngineStaticGraph = {
        specName: 'test',
        nodes: [node('createUser', 'POST'), node('getOrders')],
        edges: [
          edge('getOrders', 'createUser', 'userId|path', 'id'),
          edge('getOrders', 'createUser', 'email|query', 'email'),
        ],
      };
      const graph = mergeGraph({ staticGraph: wide });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].matches.map((m) => m.param).sort()).toEqual([
        'email|query',
        'userId|path',
      ]);
    });

    it('drops a candidate that would make an operation depend on itself', () => {
      const selfish: EngineStaticGraph = {
        specName: 'test',
        nodes: [node('getThing')],
        edges: [edge('getThing', 'getThing')],
      };
      expect(mergeGraph({ staticGraph: selfish }).edges).toEqual([]);
    });

    it('lets a Q-table entry outrank the field the comparator proposed', () => {
      // Same parameter, different source field. The Q-table is the record of
      // what the agent actually did, so its entry competes for the slot rather
      // than being ignored because the comparator picked another field.
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0.9, 'id|path', 'userId'),
      });
      const e = graph.edges.find((x) => x.from === 'getUsers')!;
      expect(e.matches[0].producedBy).toBe('userId');
      expect(e.maxQ).toBe(0.9);
      // The pair was in the static graph, so it is confirmed, not discovered.
      expect(e.kind).toBe('confirmed');
    });
  });

  describe('weight', () => {
    it('is the similarity score until the agent exercises the edge', () => {
      const graph = mergeGraph({
        staticGraph: {
          ...STATIC,
          edges: [edge('getUserById', 'getUsers', 'id|path', 'id', 0.93)],
        },
      });
      const e = graph.edges[0];
      expect(e.weight).toBe(0.93);
      expect(e.weightKind).toBe('similarity');
    });

    it('becomes the learned confidence once there is a Q-value', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0.42),
      });
      const e = graph.edges.find((x) => x.from === 'getUsers')!;
      expect(e.weight).toBe(0.42);
      expect(e.weightKind).toBe('confidence');
    });

    it('falls back to similarity when the agent recorded an exact zero', () => {
      const graph = mergeGraph({
        staticGraph: STATIC,
        learned: learned('getUserById', 'getUsers', 0),
      });
      const e = graph.edges.find((x) => x.from === 'getUsers')!;
      expect(e.weightKind).toBe('similarity');
      expect(e.weight).toBe(1);
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
      expect(e!.weightKind).toBe('confidence');
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

    it('carries only the parameters the edge actually resolves', () => {
      const graph = mergeGraph({ staticGraph: STATIC });
      const e = graph.edges.find((x) => x.from === 'getUsers')!;
      expect(e.matches).toHaveLength(1);
      expect(e.matches[0].param).toBe('id|path');
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
        candidates: 2,
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
      // A 1700-operation chain: more resolved edges than the cap, so pruning
      // runs. Resolution alone does not save a spec this size.
      const nodes = Array.from({ length: 1700 }, (_, i) => node(`op${i}`));
      const edges = nodes
        .slice(1)
        .map((_, i) => edge(`op${i + 1}`, `op${i}`, `p${i}`, `f${i}`));
      const graph = mergeGraph({
        staticGraph: { specName: 't', nodes, edges },
        learned: learned('op1', 'op0', 0.9, 'p0', 'f0'),
      });

      expect(graph.truncated).toBe(true);
      expect(graph.edges.length).toBe(600);
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

describe('upgradeStoredGraph', () => {
  /** The shape a run stored before resolution existed: every candidate drawn. */
  const legacy = {
    source: 'run',
    generatedAt: '2026-01-01T00:00:00.000Z',
    truncated: false,
    nodes: [
      {
        id: 'listA',
        method: 'GET',
        path: '/a',
        summary: null,
        parameters: [],
        hasRequestBody: false,
      },
      {
        id: 'listB',
        method: 'GET',
        path: '/b',
        summary: null,
        parameters: [],
        hasRequestBody: false,
      },
      {
        id: 'getThing',
        method: 'GET',
        path: '/t/{id}',
        summary: null,
        parameters: [],
        hasRequestBody: false,
      },
    ],
    edges: [
      {
        from: 'listA',
        to: 'getThing',
        kind: 'predicted',
        maxSimilarity: 0.82,
        maxQ: null,
        tentative: false,
        matches: [
          {
            param: 'id|path',
            paramIn: 'params',
            producedBy: 'id',
            producedIn: 'response',
            similarity: 0.82,
            q: null,
          },
        ],
      },
      {
        from: 'listB',
        to: 'getThing',
        kind: 'confirmed',
        maxSimilarity: 0.8,
        maxQ: 0.3,
        tentative: false,
        matches: [
          {
            param: 'id|path',
            paramIn: 'params',
            producedBy: 'id',
            producedIn: 'response',
            similarity: 0.8,
            q: 0.3,
          },
        ],
      },
    ],
    stats: {
      operations: 3,
      dependencies: 2,
      confirmed: 1,
      predicted: 1,
      penalized: 0,
      discovered: 0,
      isolated: 0,
      entryPoints: ['listA', 'listB'],
      mostDependedUpon: { id: 'listA', count: 1 },
    },
  } as unknown as DependencyGraph;

  it('re-resolves a payload stored before the schema bump', () => {
    const graph = upgradeStoredGraph(legacy)!;
    expect(graph.schema).toBe(GRAPH_SCHEMA);
    // Both candidates were drawn; only the learned one is a dependency.
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].from).toBe('listB');
    expect(graph.edges[0].weight).toBe(0.3);
    expect(graph.stats.candidates).toBe(2);
  });

  it('leaves a current payload alone', () => {
    const current = mergeGraph({ staticGraph: STATIC });
    expect(upgradeStoredGraph(current)).toBe(current);
  });

  it('returns null for an absent or unrecognizable row', () => {
    expect(upgradeStoredGraph(null)).toBeNull();
    expect(upgradeStoredGraph({ nodes: 'nope' })).toBeNull();
  });
});
