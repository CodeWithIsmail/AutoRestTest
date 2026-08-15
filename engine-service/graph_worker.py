"""Build a Semantic Operation Dependency Graph for a spec, without running a test.

Runs as a subprocess under the *engine's* interpreter (`ENGINE_PYTHON`), because
it imports `autoresttest` directly — engine-service's own venv does not have the
core or its gensim dependency installed. This is the single point of contact
with `autoresttest.*` outside of a test run, mirroring how `oops_worker.py`
isolates OOPS.

Only phases 1 and 2 of the engine pipeline run here: spec parsing and graph
construction. Neither touches an LLM — the graph comes from cosine similarity
over word embeddings — so this completes in seconds once the embedding model is
loaded, which is the dominant cost and the reason the caller treats it as an
async job.

Usage:  graph_worker.py <spec-path> <output-json-path>
Exits 0 on success, 1 on failure with the reason on stderr.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {argv[0]} <spec-path> <output-json-path>", file=sys.stderr)
        return 1

    spec_path = Path(argv[1])
    out_path = Path(argv[2])

    # Imported inside main so a missing/incompatible engine environment fails
    # with a readable message on stderr rather than an import traceback at load.
    try:
        from autoresttest.autoresttest import output_dependency_graph
        from autoresttest.graph.generate_graph import OperationGraph
        from autoresttest.specification import SpecificationParser
        from autoresttest.utils import EmbeddingModel
    except Exception as exc:  # noqa: BLE001
        print(f"cannot import autoresttest ({type(exc).__name__}: {exc})", file=sys.stderr)
        return 1

    try:
        spec_parser = SpecificationParser(spec_path=str(spec_path))
        graph = OperationGraph(
            spec_path=str(spec_path),
            spec_name=spec_path.stem,
            spec_parser=spec_parser,
            embedding_model=EmbeddingModel(),
        )
        graph.create_graph()
    except Exception as exc:  # noqa: BLE001
        print(f"graph construction failed ({type(exc).__name__}: {exc})", file=sys.stderr)
        return 1

    # `output_dependency_graph` writes to data/<spec_name>/graph.json, which
    # jobs.py deletes before every test run. Reuse it for the serialization —
    # one definition of the wire format, not two — then move the payload to the
    # caller's path so the two never race.
    try:
        output_dependency_graph(graph, spec_path.stem)
        from autoresttest.autoresttest import ensure_output_dir

        produced = ensure_output_dir(spec_path.stem) / "graph.json"
        payload = json.loads(produced.read_text(encoding="utf-8"))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"graph export failed ({type(exc).__name__}: {exc})", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
