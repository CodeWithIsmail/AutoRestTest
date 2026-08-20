// Typed wrappers around the /projects/:id/test-suites endpoints.

import { apiFetch } from "./api";
import type {
  CreateTestSuiteInput,
  TestCaseItem,
  TestSuiteDetail,
  TestSuiteSummary,
} from "./types";

export function listSuites(
  projectId: string,
  signal?: AbortSignal,
): Promise<TestSuiteSummary[]> {
  return apiFetch<TestSuiteSummary[]>(`/projects/${projectId}/test-suites`, {
    signal,
  });
}

export function getSuite(
  projectId: string,
  suiteId: string,
  signal?: AbortSignal,
): Promise<TestSuiteDetail> {
  return apiFetch<TestSuiteDetail>(
    `/projects/${projectId}/test-suites/${suiteId}`,
    { signal },
  );
}

export function createSuite(
  projectId: string,
  input: CreateTestSuiteInput,
): Promise<TestSuiteDetail> {
  return apiFetch<TestSuiteDetail>(`/projects/${projectId}/test-suites`, {
    method: "POST",
    body: input,
  });
}

export function runSuite(
  projectId: string,
  suiteId: string,
): Promise<TestSuiteDetail> {
  return apiFetch<TestSuiteDetail>(
    `/projects/${projectId}/test-suites/${suiteId}/run`,
    { method: "POST" },
  );
}

/** Resends the origin run's captured request sequence as a new linked suite. */
export function replaySuite(
  projectId: string,
  suiteId: string,
): Promise<TestSuiteDetail> {
  return apiFetch<TestSuiteDetail>(
    `/projects/${projectId}/test-suites/${suiteId}/replay`,
    { method: "POST" },
  );
}

/** The origin run plus every replay of it, oldest first. */
export function getRunHistory(
  projectId: string,
  suiteId: string,
  signal?: AbortSignal,
): Promise<TestSuiteSummary[]> {
  return apiFetch<TestSuiteSummary[]>(
    `/projects/${projectId}/test-suites/${suiteId}/history`,
    { signal },
  );
}

export function getTestCases(
  projectId: string,
  suiteId: string,
  signal?: AbortSignal,
): Promise<TestCaseItem[]> {
  return apiFetch<TestCaseItem[]>(
    `/projects/${projectId}/test-suites/${suiteId}/test-cases`,
    { signal },
  );
}

export function deleteSuite(
  projectId: string,
  suiteId: string,
): Promise<{ message: string }> {
  return apiFetch(`/projects/${projectId}/test-suites/${suiteId}`, {
    method: "DELETE",
  });
}
