import { MongoClient, ServerApiVersion } from "mongodb"
import { Octokit } from "octokit"
import { Commit } from "./types"

async function getLatestGithubCommit(octokitClient: Octokit, query: string): Promise<Commit | null> {
  const commitSearchResults = await octokitClient.rest.search.commits({
    q: `${query} author-date:<${(new Date()).toISOString()}`,
    sort: 'author-date',
    order: 'desc',
    per_page: 1
  })

  if (commitSearchResults.data.items.length === 0) return null
  return {
    url: commitSearchResults.data.items[0].html_url,
    sha: commitSearchResults.data.items[0].sha,
    date: new Date(commitSearchResults.data.items[0].commit.author.date),
    author: commitSearchResults.data.items[0].author?.login,
    message: commitSearchResults.data.items[0].commit.message,
  }
}

async function insertNewCommit (client: MongoClient, commit: Commit): Promise<boolean> {
  const freshCommitsCollection = client.db('every-fkn-commit')?.collection<Commit>('fresh-commits')
  const usedCommitsCollection = client.db('every-fkn-commit')?.collection<Commit>('used-commits')
  if (freshCommitsCollection == null || usedCommitsCollection == null) throw new Error('Could not find collection')

  if (await usedCommitsCollection.findOne<Commit>({ sha: commit.sha }) != null) {
    return false
  }

  const updateResult = await freshCommitsCollection.updateOne({ sha: commit.sha }, { $set: commit }, {
    upsert: true
  })

  return updateResult.upsertedCount > 0
}

async function handleNewestCommit (octokitClient: Octokit, mongoClient: MongoClient, keyword: string) {
  const commit = await getLatestGithubCommit(octokitClient, keyword)
  if (commit == null) {
    return
  }

  await insertNewCommit(mongoClient, commit)
}

async function main () {
  const uri = `mongodb+srv://${process.env.DB_USER ?? 'user'}:${process.env.DB_PASSWORD ?? 'pass'}@cluster0.cftdtes.mongodb.net/?retryWrites=true&w=majority`
  const mongoClient = await new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    }
  }).connect()
  const octokitClient = new Octokit({})
  
  try {
    await handleNewestCommit(octokitClient, mongoClient, 'fuck')
  } finally {
    await mongoClient.close()
  }
}

main().catch(console.error)
