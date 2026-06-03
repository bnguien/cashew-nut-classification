let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setSessionTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}
