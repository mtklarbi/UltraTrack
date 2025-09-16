export function getApiBase(): string {
  return localStorage.getItem('semdiff_api_base') || 'http://localhost:8000/api';
}

export function setApiBase(url: string) {
  localStorage.setItem('semdiff_api_base', url);
}

export function getToken(): string | null {
  return localStorage.getItem('semdiff_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('semdiff_token', token);
  else localStorage.removeItem('semdiff_token');
}

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${getApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Login failed');
  const json = await res.json();
  const token = json.access_token as string;
  setToken(token);
  return token;
}

