/**
 * Открыть PR или завести issue.
 *
 * Воркер ничего не публикует. Он только предлагает: складывает разобранную
 * запись и сырой HTML страницы в ветку и открывает PR. Цифра попадает на сайт
 * ровно тогда, когда человек откроет акт, впишет даты, которых на странице
 * нет, и сольёт PR руками.
 *
 * Все обращения к API идут через переданный `fetch`, чтобы тест мог
 * проверить последовательность запросов, ничего никуда не отправляя.
 */

const API = 'https://api.github.com';

export interface GitHubConfig {
  readonly token: string;
  /** `владелец/репозиторий`. */
  readonly repo: string;
  readonly baseBranch?: string;
  readonly fetchImpl?: typeof fetch;
}

/** UTF-8 → base64. `btoa` работает только с latin1 и на кириллице падает. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export class GitHub {
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(private readonly config: GitHubConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.base = config.baseBranch ?? 'main';
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.config.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'gold-by-watcher',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new GitHubError(`${init.method ?? 'GET'} ${path} → ${response.status}: ${body.slice(0, 300)}`, response.status);
    }

    return (await response.json()) as T;
  }

  /** Существует ли ветка. Нужна, чтобы не открывать второй PR о том же акте. */
  async branchExists(branch: string): Promise<boolean> {
    try {
      await this.call(`/repos/${this.config.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      return true;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return false;
      throw error;
    }
  }

  async createBranch(branch: string): Promise<void> {
    const ref = await this.call<{ object: { sha: string } }>(
      `/repos/${this.config.repo}/git/ref/heads/${encodeURIComponent(this.base)}`,
    );
    await this.call(`/repos/${this.config.repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
    });
  }

  async readFile(path: string, ref: string): Promise<{ text: string; sha: string } | null> {
    try {
      const file = await this.call<{ content: string; sha: string }>(
        `/repos/${this.config.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      );
      return { text: fromBase64(file.content), sha: file.sha };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  async writeFile(
    path: string,
    branch: string,
    text: string,
    message: string,
    sha?: string,
  ): Promise<void> {
    await this.call(`/repos/${this.config.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        branch,
        content: toBase64(text),
        ...(sha === undefined ? {} : { sha }),
      }),
    });
  }

  async openPullRequest(branch: string, title: string, body: string): Promise<{ number: number; html_url: string }> {
    return this.call<{ number: number; html_url: string }>(`/repos/${this.config.repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, body, head: branch, base: this.base }),
    });
  }

  async openIssue(title: string, body: string, labels: readonly string[] = []): Promise<{ number: number; html_url: string }> {
    return this.call<{ number: number; html_url: string }>(`/repos/${this.config.repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    });
  }

  /** Открытые issue с таким заголовком — чтобы не заводить одно и то же каждый час. */
  async hasOpenIssue(title: string): Promise<boolean> {
    const issues = await this.call<{ title: string }[]>(
      `/repos/${this.config.repo}/issues?state=open&per_page=100`,
    );
    return issues.some((issue) => issue.title === title);
  }
}
