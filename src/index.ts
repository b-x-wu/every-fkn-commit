import { Octokit } from "octokit"
import { MongoClient, ServerApiVersion } from 'mongodb'
import * as dotenv from 'dotenv'
dotenv.config()

interface Commit {
  url: string // html_url
  sha: string
  date: Date // author date
  author?: string // author login
  message: string
}

async function sleep (ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function popLatestMongoCommit(client: MongoClient): Promise<Commit | null> {
  const freshCommitsCollection = client.db('every-fkn-commit')?.collection<Commit>('fresh-commits')
  const usedCommitsCollection = client.db('every-fkn-commit')?.collection<Commit>('used-commits')
  if (freshCommitsCollection == null || usedCommitsCollection == null) throw new Error('Could not find collection')

  const commit = await freshCommitsCollection.findOneAndDelete({}, {
    sort: {
      date: 'desc'
    }
  })
  if (commit.value == null) return null

  usedCommitsCollection.updateOne({ sha: commit.value.sha }, { $set: commit.value }, {
    upsert: true
  })
  return commit.value
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

function keywordPresentInTweet(message: string, keyword: string): boolean {
  return message.substring(0, 255).includes(keyword)
}

async function handleNewestCommit (octokitClient: Octokit, mongoClient: MongoClient, keyword: string) {
  const commit = await getLatestGithubCommit(octokitClient, keyword)
  if (commit == null || !keywordPresentInTweet(commit.message, keyword)) {
    return
  }

  await insertNewCommit(mongoClient, commit)
}

async function broadcastCommit (commit: Commit): Promise<void> {
  console.log(commit)
}

async function handleTweetCommit (mongoClient: MongoClient): Promise<void> {
  const commit = await popLatestMongoCommit(mongoClient)
  if (commit == null) {
    return
  }
  broadcastCommit(commit)
} 

// TODO
// Get and store all commits with "fuck" that came after the most recent one gotten
//    get the most recent commit that matches query
//    check if it's already present in the db
//    if not present, add to db
// Fetch the newest stored commit and delete it
//    fetch the newest one
//    tweet it
//    delete it

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
}

main().catch(console.error)
