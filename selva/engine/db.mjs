// Browser-local play has no database service or credentials.
export const dbEnabled = () => false;
export const initDb = async () => {};
export const runMigrations = async () => {};
export const closeDb = async () => {};
export const getPool = () => null;
export async function query(){throw new Error('Database access is not part of single-player Selva.');}
export async function withClient(){throw new Error('Database access is not part of single-player Selva.');}
export const withTransaction = withClient;
