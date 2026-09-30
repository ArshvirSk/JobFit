import httpx
import logging
from typing import Dict, Any, List
from datetime import datetime, timedelta
from backend.config import settings

logger = logging.getLogger(__name__)

class OAuthService:
    # Google Endpoints
    GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
    GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

    # Microsoft Endpoints
    MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    MS_REVOKE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/logout" 

    # GitHub Endpoints
    GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
    GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"

    @staticmethod
    def get_auth_url(provider: str, redirect_uri: str, state: str, extra_scopes: List[str] = None) -> str:
        """Generate the authorization URL for the given provider."""
        if provider == "google":
            scopes = [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/calendar.readonly"
            ]
            if extra_scopes:
                scopes.extend(extra_scopes)
            
            # Using prompt=consent and access_type=offline to guarantee refresh_token
            scope_str = " ".join(scopes)
            url = f"{OAuthService.GOOGLE_AUTH_URL}?client_id={settings.google_client_id}&redirect_uri={redirect_uri}&response_type=code&scope={scope_str}&state={state}&access_type=offline&prompt=consent"
            return url
            
        elif provider == "outlook":
            scopes = ["offline_access", "Mail.Read", "Calendars.Read"]
            scope_str = " ".join(scopes)
            url = f"{OAuthService.MS_AUTH_URL}?client_id={settings.microsoft_client_id}&response_type=code&redirect_uri={redirect_uri}&response_mode=query&scope={scope_str}&state={state}"
            return url
        elif provider == "github":
            scopes = ["read:user", "public_repo"]
            scope_str = " ".join(scopes)
            url = f"{OAuthService.GITHUB_AUTH_URL}?client_id={settings.github_client_id}&redirect_uri={redirect_uri}&scope={scope_str}&state={state}"
            return url
        else:
            raise ValueError(f"Unsupported provider: {provider}")

    @staticmethod
    async def exchange_code(provider: str, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchanges the authorization code for access and refresh tokens."""
        async with httpx.AsyncClient() as client:
            if provider == "google":
                data = {
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri
                }
                resp = await client.post(OAuthService.GOOGLE_TOKEN_URL, data=data)
                resp.raise_for_status()
                return resp.json()
            elif provider == "outlook":
                data = {
                    "client_id": settings.microsoft_client_id,
                    "client_secret": settings.microsoft_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri
                }
                resp = await client.post(OAuthService.MS_TOKEN_URL, data=data)
                resp.raise_for_status()
                return resp.json()
            elif provider == "github":
                data = {
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri
                }
                headers = {"Accept": "application/json"}
                resp = await client.post(OAuthService.GITHUB_TOKEN_URL, data=data, headers=headers)
                resp.raise_for_status()
                return resp.json()
            else:
                raise ValueError(f"Unsupported provider: {provider}")

    @staticmethod
    async def refresh_token(provider: str, refresh_token: str) -> Dict[str, Any]:
        """Refreshes an expired access token using the refresh token."""
        async with httpx.AsyncClient() as client:
            if provider == "google":
                data = {
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                }
                resp = await client.post(OAuthService.GOOGLE_TOKEN_URL, data=data)
                resp.raise_for_status()
                return resp.json()
            elif provider == "outlook":
                data = {
                    "client_id": settings.microsoft_client_id,
                    "client_secret": settings.microsoft_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                }
                resp = await client.post(OAuthService.MS_TOKEN_URL, data=data)
                resp.raise_for_status()
                return resp.json()
            elif provider == "github":
                # GitHub OAuth apps do not support refresh tokens (tokens do not expire unless revoked)
                # GitHub Apps do, but we are using an OAuth App.
                raise ValueError("GitHub OAuth tokens do not expire and cannot be refreshed.")
            else:
                raise ValueError(f"Unsupported provider: {provider}")

    @staticmethod
    async def revoke_token(provider: str, access_token: str):
        """Revokes the given access token at the provider level."""
        async with httpx.AsyncClient() as client:
            try:
                if provider == "google":
                    # Google revoke endpoint accepts the token directly
                    resp = await client.post(OAuthService.GOOGLE_REVOKE_URL, data={"token": access_token})
                    # We consider a successful HTTP request or a 400 (already revoked) as success for local cleanup
                elif provider == "outlook":
                    logger.info("Microsoft tokens revoked locally. Remote revocation requires Graph API revokeSignInSessions or manual user action.")
                elif provider == "github":
                    # GitHub API for revocation requires Basic Auth with client_id and secret
                    url = f"https://api.github.com/applications/{settings.github_client_id}/grant"
                    data = {"access_token": access_token}
                    auth = (settings.github_client_id, settings.github_client_secret)
                    resp = await client.delete(url, json=data, auth=auth)
                    # Even if this fails, we will remove it locally
            except Exception as e:
                logger.warning(f"Failed to revoke {provider} token remotely: {str(e)}. Will still remove locally.")
