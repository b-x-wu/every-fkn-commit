import { Octokit } from "octokit"
import { MongoClient, ServerApiVersion } from 'mongodb'
import * as dotenv from 'dotenv'
import { TwitterApi, TwitterApiReadWrite } from "twitter-api-v2"
import { schedule } from 'node-cron'
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

async function handleNewestCommit (octokitClient: Octokit, mongoClient: MongoClient, keyword: string) {
  const commit = await getLatestGithubCommit(octokitClient, keyword)
  if (commit == null) {
    return
  }

  await insertNewCommit(mongoClient, commit)
}

async function getGithubUserTwitterHandle (octokitClient: Octokit, username: string): Promise<string | null> {
  return (await octokitClient.rest.users.getByUsername({
    username
  })).data.twitter_username ?? null
}

async function commitToTweet (octokitClient: Octokit, commit: Commit): Promise<string> {
  let authorString = ''
  if (commit.author != null) {
    authorString = `by ${commit.author}`
    const twitterHandle = await getGithubUserTwitterHandle(octokitClient, commit.author)
    if (twitterHandle != null) authorString = `${authorString} (@${twitterHandle})`
  }
  let messageString = commit.message

  if (authorString.length === 0) {
    if (messageString.length + 25 > 280) {
      messageString = `${messageString.substring(0, 252)}...`
    }
    return `${messageString}\n\n${commit.url}`
  }
    
  if (messageString.length + authorString.length + 27 > 280) {
    messageString = `${messageString.substring(0, 250 - authorString.length)}...`
  }
  return `${messageString}\n\n${authorString}\n\n${commit.url}`
}

async function broadcastCommit (twitterClient: TwitterApiReadWrite, octokitClient: Octokit, commit: Commit): Promise<void> {
  const tweet = await commitToTweet(octokitClient, commit)
  if (process.env.NODE_ENV === 'production') {
    await twitterClient.v2.tweet({ text: tweet })
    return
  }
  console.log(tweet)
}

async function handleTweetCommit (twitterClient: TwitterApiReadWrite, octokitClient: Octokit, mongoClient: MongoClient): Promise<void> {
  const commit = await popLatestMongoCommit(mongoClient)
  if (commit == null) {
    return
  }
  broadcastCommit(twitterClient, octokitClient, commit)
} 

async function loadFreshCommits (mongoClient: MongoClient, octokitClient: Octokit) {
  await handleNewestCommit(octokitClient, mongoClient, 'l')
  await sleep(2000)
  await handleNewestCommit(octokitClient, mongoClient, 'm')
  await sleep(2000)
  await handleNewestCommit(octokitClient, mongoClient, 'n')
  await sleep(2000)
  await handleNewestCommit(octokitClient, mongoClient, 'o')
  await sleep(2000)
  await handleNewestCommit(octokitClient, mongoClient, 'p')
  await sleep(2000)
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
  const twitterClient = (new TwitterApi({
    appKey: process.env.TWITTER_API_KEY ?? '',
    appSecret: process.env.TWITTER_API_KEY_SECRET ?? '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN ?? '',
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET ?? ''
  })).readWrite

  const handleTweetCommitTask = schedule('29 * * * *', () => {
    void (async () => {
      await handleTweetCommit(twitterClient, octokitClient, mongoClient)
    })()
  })

  const handleNewestCommitTask = schedule('*/20 * * * * *', () => {
    void (async () => {
      await handleNewestCommit(octokitClient, mongoClient, 'fuck')
    })()
  })

  handleTweetCommitTask.start()
  handleNewestCommitTask.start()

  process.on('SIGINT', () => {
    mongoClient.close()
    handleNewestCommitTask.stop()
    handleTweetCommitTask.stop()
  })

  process.on('SIGTERM', () => {
    mongoClient.close()
    handleNewestCommitTask.stop()
    handleTweetCommitTask.stop()
  })

}

main().catch(console.error)
