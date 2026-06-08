export const cognitoConfig = {
  authority: process.env.REACT_APP_COGNITO_AUTHORITY,
  client_id: process.env.REACT_APP_COGNITO_CLIENT_ID,
  redirect_uri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
  post_logout_redirect_uri: process.env.REACT_APP_LOGOUT_URI || window.location.origin,
  response_type: 'code',
  scope: 'openid email profile',
  automaticSilentRenew: true,
  loadUserInfo: true,
};

export const buildLogoutUrl = () => {
  const clientId = process.env.REACT_APP_COGNITO_CLIENT_ID;
  const logoutUri = encodeURIComponent(process.env.REACT_APP_LOGOUT_URI || window.location.origin);
  const domain = process.env.REACT_APP_COGNITO_DOMAIN;
  if (!domain) return null;
  return `${domain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`;
};

export const API_BASE = process.env.REACT_APP_API_BASE_URL || '';