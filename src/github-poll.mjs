import { normalizeGitHubEvent } from "./settler.mjs";

const required = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(name + " is required");
  return value.trim();
};

async function pages({ getJson, path, perPage = 30, maxPages = 100 }) {
  if (typeof getJson !== "function") throw new TypeError("getJson function is required");
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new RangeError("perPage must be between 1 and 100");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) throw new RangeError("maxPages must be between 1 and 1000");
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await getJson(path + (path.includes("?") ? "&" : "?") + "per_page=" + perPage + "&page=" + page);
    if (!Array.isArray(batch)) throw new TypeError("GitHub page must be an array: " + path);
    rows.push(...batch);
    if (batch.length < perPage) return rows;
  }
  throw new Error("GitHub pagination bound reached: " + path);
}

export async function collectGitHubRepositoryDeltas({ getJson, repository, state = "open", since, perPage = 30, maxPages = 100 } = {}) {
  if (!repository || !Number.isInteger(repository.id) || typeof repository.full_name !== "string") {
    throw new TypeError("repository.id and repository.full_name are required");
  }
  const sinceQuery = since === undefined ? "" : "&since=" + encodeURIComponent(required(since, "since"));
  const issues = await pages({
    getJson,
    path: "repos/" + repository.full_name + "/issues?state=" + encodeURIComponent(state) + sinceQuery,
    perPage,
    maxPages,
  });
  const deltas = [];
  for (const item of issues) {
    if (item.pull_request) {
      const pull = await getJson("repos/" + repository.full_name + "/pulls/" + encodeURIComponent(String(item.number)));
      deltas.push(normalizeGitHubEvent({ action: "observed", repository, sender: pull.user ?? item.user ?? null, pull_request: pull }));
    } else {
      deltas.push(normalizeGitHubEvent({ action: "observed", repository, sender: item.user ?? null, issue: item }));
    }
  }
  return deltas.sort((left, right) => String(left.source.occurredAt ?? "").localeCompare(String(right.source.occurredAt ?? "")) || left.eventKey.localeCompare(right.eventKey));
}

export async function collectGitHubRepositories({ getJson, repositories, state = "open", since, perPage = 30, maxPages = 100 } = {}) {
  if (!Array.isArray(repositories) || repositories.length === 0) throw new TypeError("repositories are required");
  const result = [];
  for (const repository of repositories) {
    result.push(...await collectGitHubRepositoryDeltas({ getJson, repository, state, since, perPage, maxPages }));
  }
  return result;
}
