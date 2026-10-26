// localStorage can be missing or throw (private mode, blocked site data), so
// every access is guarded and the app keeps working without it.

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not persisted; the participant will simply join as new next time
  }
}

export const savedName = () => read("retroloop:name");
export const saveName = (name: string) => write("retroloop:name", name);

export const savedToken = (retroId: string) => read(`retroloop:token:${retroId}`) ?? undefined;
export const saveToken = (retroId: string, token: string) => write(`retroloop:token:${retroId}`, token);

/** The facilitator key of a retro this browser created. */
export const savedHostKey = (retroId: string) => read(`retroloop:host:${retroId}`) ?? undefined;
export const saveHostKey = (retroId: string, key: string) => write(`retroloop:host:${retroId}`, key);

/** The "owner/repo" last used for GitHub issue links. */
export const savedGithubRepo = () => read("retroloop:github-repo") ?? "";
export const saveGithubRepo = (repo: string) => write("retroloop:github-repo", repo);
