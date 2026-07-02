// Typed wrappers around the /projects/:id/test-suites endpoints.

import { apiFetch } from "./api";
import type {
  CreateTestSuiteInput,
  TestCaseItem,
  TestSuiteDetail,
  TestSuiteSummary,
} from "./types";

export function listSuites(projectId: string): Promise<TestSuiteSummary[]> {
  return apiFetch<TestSuiteSummary[]>(`/projects/${projectId}/test-suites`);
}

export function getSuite(
  projectId: string,
  suiteId: string,
): Promise<TestSuiteDetail> {
  return apiFetch<TestSuiteDetail>(
    `/projects/${projectId}/test-suites/${suiteId}`,
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

export function getTestCases(
  projectId: string,
  suiteId: string,
): Promise<TestCaseItem[]> {
  return apiFetch<TestCaseItem[]>(
    `/projects/${projectId}/test-suites/${suiteId}/test-cases`,
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
