import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();

const configuration = new Configuration({
  basePath:
    env === "production"
      ? PlaidEnvironments.production
      : env === "development"
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID || "",
      "PLAID-SECRET": process.env.PLAID_SECRET || "",
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export function assertPlaidEnv() {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error(
      "Missing PLAID_CLIENT_ID or PLAID_SECRET. Add them to .env.local (Codespaces: devcontainer env / secrets)."
    );
  }
}
