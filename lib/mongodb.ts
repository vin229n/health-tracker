import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_CONNECTION_STRING;
const dbName = process.env.MONGODB_DB || "health_tracker";

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  const connectionUri = process.env.MONGODB_CONNECTION_STRING || uri;
  if (!connectionUri) {
    throw new Error("Missing MONGODB_CONNECTION_STRING environment variable");
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      client = new MongoClient(connectionUri);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  } else {
    if (!clientPromise) {
      client = new MongoClient(connectionUri);
      clientPromise = client.connect();
    }
    return clientPromise;
  }
}

export async function getDatabase(): Promise<Db> {
  const client = await getClientPromise();
  const currentDbName = process.env.MONGODB_DB || dbName;
  return client.db(currentDbName);
}

export default getClientPromise;
