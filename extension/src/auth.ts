import * as vscode from 'vscode';

export interface DeveloperProfile {
  login: string;
  name: string;
  avatarUrl: string;
  email?: string;
  authenticatedAt: string;
}

const PROFILE_KEY = 'conflictlens.developerProfile';
const TOKEN_KEY = 'conflictlens.githubToken';

/**
 * Manages per-developer GitHub OAuth session and identity.
 */
export class AuthManager {
  private static _currentProfile: DeveloperProfile | null = null;

  public static async init(context: vscode.ExtensionContext): Promise<void> {
    const raw = context.globalState.get<string>(PROFILE_KEY);
    if (raw) {
      try {
        AuthManager._currentProfile = JSON.parse(raw);
      } catch {
        AuthManager._currentProfile = null;
      }
    }
  }

  public static getProfile(): DeveloperProfile | null {
    return AuthManager._currentProfile;
  }

  /**
   * Triggers GitHub Authentication using VS Code native Auth provider
   * with fallback to OAuth URL flow.
   */
  public static async authenticate(context: vscode.ExtensionContext): Promise<DeveloperProfile | null> {
    try {
      // 1. Try VS Code's built-in GitHub authentication provider
      const session = await vscode.authentication.getSession('github', ['repo', 'read:user', 'user:email'], {
        createIfNone: true,
      });

      if (session) {
        const profile: DeveloperProfile = {
          login: session.account.label,
          name: session.account.label,
          avatarUrl: `https://github.com/${session.account.label}.png`,
          authenticatedAt: new Date().toISOString(),
        };

        await context.secrets.store(TOKEN_KEY, session.accessToken);
        await context.globalState.update(PROFILE_KEY, JSON.stringify(profile));
        AuthManager._currentProfile = profile;
        vscode.window.showInformationMessage(`ConflictLens: Connected as ${profile.login} ✅`);
        return profile;
      }
    } catch (err) {
      console.warn('[ConflictLens] VS Code auth session fallback to custom OAuth URI:', err);
    }

    // 2. Custom OAuth URL fallback using registered redirect URI
    const clientId = process.env.GITHUB_CLIENT_ID || 'Ov23liXXXXXXXXXX';
    const redirectUri = encodeURIComponent('vscode://ctrl-future.conflictlens/auth-callback');
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo%20user:email`;

    vscode.env.openExternal(vscode.Uri.parse(authUrl));
    return null;
  }

  /**
   * Handle incoming OAuth callback URI: vscode://ctrl-future.conflictlens/auth-callback?code=...
   */
  public static async handleCallback(
    uri: vscode.Uri,
    context: vscode.ExtensionContext
  ): Promise<DeveloperProfile | null> {
    const query = new URLSearchParams(uri.query);
    const code = query.get('code');

    if (!code) {
      vscode.window.showErrorMessage('ConflictLens: GitHub authentication failed — missing code parameter.');
      return null;
    }

    try {
      const clientId = process.env.GITHUB_CLIENT_ID || '';
      const clientSecret = process.env.GITHUB_CLIENT_SECRET || '';

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        throw new Error('No access_token returned from GitHub.');
      }

      // Fetch user profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'User-Agent': 'ConflictLens-VSCode-Extension',
        },
      });

      const userData = (await userRes.json()) as { login: string; name?: string; avatar_url: string; email?: string };

      const profile: DeveloperProfile = {
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url,
        email: userData.email,
        authenticatedAt: new Date().toISOString(),
      };

      await context.secrets.store(TOKEN_KEY, tokenData.access_token);
      await context.globalState.update(PROFILE_KEY, JSON.stringify(profile));
      AuthManager._currentProfile = profile;

      vscode.window.showInformationMessage(`ConflictLens: GitHub OAuth successful! Logged in as @${profile.login}`);
      return profile;
    } catch (err) {
      console.error('[ConflictLens] OAuth callback error:', err);
      vscode.window.showErrorMessage('ConflictLens: Failed to complete GitHub OAuth sign in.');
      return null;
    }
  }

  public static async logout(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(TOKEN_KEY);
    await context.globalState.update(PROFILE_KEY, undefined);
    AuthManager._currentProfile = null;
    vscode.window.showInformationMessage('ConflictLens: Logged out from GitHub.');
  }
}
