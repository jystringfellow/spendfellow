import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode, Transaction } from 'plaid';

export type PlaidEnvironment = 'sandbox' | 'development' | 'production';

interface PlaidErrorBody {
  error_code?: string;
  error_message?: string;
  error_type?: string;
  request_id?: string;
}

export class PlaidApiError extends Error {
  plaidError?: PlaidErrorBody;

  constructor(message: string, plaidError?: PlaidErrorBody) {
    super(message);
    this.name = 'PlaidApiError';
    this.plaidError = plaidError;
  }
}

function getPlaidErrorBody(error: unknown): PlaidErrorBody | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }

  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;

  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  return data as PlaidErrorBody;
}

function toPlaidApiError(action: string, error: unknown): PlaidApiError {
  const plaidError = getPlaidErrorBody(error);
  const message = plaidError?.error_message ?? (error instanceof Error ? error.message : `Unable to ${action}.`);

  console.error(`Plaid ${action} failed`, {
    error_code: plaidError?.error_code,
    error_type: plaidError?.error_type,
    request_id: plaidError?.request_id,
    message,
  });

  return new PlaidApiError(message, plaidError);
}

export function hasPlaidEnv(): boolean {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_ENV) {
    return false;
  }

  const plaidEnv = parsePlaidEnvironment(process.env.PLAID_ENV);
  return Boolean(plaidEnv && getPlaidSecret(plaidEnv));
}

function getPlaidRedirectUri(environment: PlaidEnvironment): string | undefined {
  const redirectUri = process.env.PLAID_REDIRECT_URI;

  if (!redirectUri) {
    return undefined;
  }

  if (environment === 'production' && !redirectUri.startsWith('https://')) {
    console.warn('Ignoring PLAID_REDIRECT_URI for production because Plaid requires HTTPS redirect URIs.', {
      redirect_uri: redirectUri,
    });
    return undefined;
  }

  return redirectUri;
}

export function parsePlaidEnvironment(environment: string | null | undefined): PlaidEnvironment | null {
  if (environment === 'sandbox' || environment === 'development' || environment === 'production') {
    return environment;
  }

  return null;
}

export function getConfiguredPlaidEnvironment(): PlaidEnvironment {
  const plaidEnv = parsePlaidEnvironment(process.env.PLAID_ENV);

  if (!plaidEnv) {
    throw new Error('Invalid PLAID_ENV. Must be one of: sandbox, development, production');
  }

  return plaidEnv;
}

export function getPlaidEnvironmentFromAccessToken(accessToken: string): PlaidEnvironment | null {
  const tokenEnvironment = accessToken.match(/^access-(sandbox|development|production)-/)?.[1];
  return parsePlaidEnvironment(tokenEnvironment);
}

export function resolvePlaidEnvironment(
  environment: PlaidEnvironment | null | undefined,
  accessToken?: string
): PlaidEnvironment {
  return environment ?? (accessToken ? getPlaidEnvironmentFromAccessToken(accessToken) : null) ?? getConfiguredPlaidEnvironment();
}

function getPlaidSecret(environment: PlaidEnvironment): string | undefined {
  const environmentSecretName = `PLAID_${environment.toUpperCase()}_SECRET`;
  const environmentSecret = process.env[environmentSecretName];

  if (environmentSecret) {
    return environmentSecret;
  }

  return process.env.PLAID_ENV === environment ? process.env.PLAID_SECRET : undefined;
}

function getPlaidClient(environment = getConfiguredPlaidEnvironment()): PlaidApi {
  if (!process.env.PLAID_CLIENT_ID) {
    throw new Error('Missing required Plaid environment variable: PLAID_CLIENT_ID');
  }

  const plaidSecret = getPlaidSecret(environment);
  if (!plaidSecret) {
    throw new Error(
      `Missing Plaid secret for ${environment}. Add PLAID_${environment.toUpperCase()}_SECRET or set PLAID_SECRET while PLAID_ENV=${environment}.`
    );
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[environment],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': plaidSecret,
      },
    },
  });

  return new PlaidApi(configuration);
}

/**
 * Create a Plaid Link token for initializing Plaid Link
 * @param userId - User ID
 * @returns Link token
 */
export async function createLinkToken(userId: string, environment = getConfiguredPlaidEnvironment()): Promise<string> {
  try {
    const plaidClient = getPlaidClient(environment);
    const redirectUri = getPlaidRedirectUri(environment);
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: 'Spendfellow',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });
    
    return response.data.link_token;
  } catch (error) {
    throw toPlaidApiError('create link token', error);
  }
}

/**
 * Exchange a public token for an access token
 * @param publicToken - Public token from Plaid Link
 * @returns Access token and item ID
 */
export async function exchangePublicToken(
  publicToken: string,
  environment = getConfiguredPlaidEnvironment()
): Promise<{
  accessToken: string;
  itemId: string;
}> {
  try {
    const plaidClient = getPlaidClient(environment);
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    
    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  } catch (error) {
    throw toPlaidApiError('exchange public token', error);
  }
}

/**
 * Fetch accounts for a Plaid item
 * @param accessToken - Plaid access token
 * @returns List of accounts
 */
export async function fetchAccounts(accessToken: string, environment = getConfiguredPlaidEnvironment()) {
  try {
    const plaidClient = getPlaidClient(environment);
    const response = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    
    return response.data.accounts;
  } catch (error) {
    throw toPlaidApiError('fetch accounts', error);
  }
}

export async function removePlaidItem(accessToken: string, environment = getConfiguredPlaidEnvironment()) {
  try {
    const plaidClient = getPlaidClient(environment);
    await plaidClient.itemRemove({
      access_token: accessToken,
    });
  } catch (error) {
    throw toPlaidApiError('remove item', error);
  }
}

/**
 * Fetch transactions for a Plaid item
 * @param accessToken - Plaid access token
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns List of transactions
 */
export async function fetchTransactions(
  accessToken: string,
  startDate: string,
  endDate: string,
  environment = getConfiguredPlaidEnvironment()
) {
  try {
    const plaidClient = getPlaidClient(environment);
    const transactions: Transaction[] = [];
    let offset = 0;
    let totalTransactions = 0;

    do {
      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: {
          count: 500,
          offset,
        },
      });

      transactions.push(...response.data.transactions);
      totalTransactions = response.data.total_transactions;
      offset += response.data.transactions.length;
    } while (transactions.length < totalTransactions);

    return transactions;
  } catch (error) {
    throw toPlaidApiError('fetch transactions', error);
  }
}
