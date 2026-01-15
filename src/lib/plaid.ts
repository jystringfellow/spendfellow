import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

// Validate environment variables
if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET || !process.env.PLAID_ENV) {
  throw new Error('Missing required Plaid environment variables: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV');
}

const plaidEnv = process.env.PLAID_ENV as keyof typeof PlaidEnvironments;
if (!PlaidEnvironments[plaidEnv]) {
  throw new Error(`Invalid PLAID_ENV: ${plaidEnv}. Must be one of: sandbox, development, production`);
}

// Initialize Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments[plaidEnv],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

/**
 * Create a Plaid Link token for initializing Plaid Link
 * @param userId - User ID
 * @returns Link token
 */
export async function createLinkToken(userId: string): Promise<string> {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: 'SpendFellow',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    
    return response.data.link_token;
  } catch (error) {
    console.error('Error creating link token:', error);
    throw error;
  }
}

/**
 * Exchange a public token for an access token
 * @param publicToken - Public token from Plaid Link
 * @returns Access token and item ID
 */
export async function exchangePublicToken(publicToken: string): Promise<{
  accessToken: string;
  itemId: string;
}> {
  try {
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    
    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  } catch (error) {
    console.error('Error exchanging public token:', error);
    throw error;
  }
}

/**
 * Fetch accounts for a Plaid item
 * @param accessToken - Plaid access token
 * @returns List of accounts
 */
export async function fetchAccounts(accessToken: string) {
  try {
    const response = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    
    return response.data.accounts;
  } catch (error) {
    console.error('Error fetching accounts:', error);
    throw error;
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
  endDate: string
) {
  try {
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
    });
    
    return response.data.transactions;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}
