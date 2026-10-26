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
