import { MongoClient, ServerApiVersion } from "mongodb"
import { writeFileSync } from "fs"
import { Octokit } from "octokit"
import { TwitterApi, TwitterApiReadWrite } from "twitter-api-v2"
import { Commit } from "./types"

const ACCOUNT_NAME = 'EveryFknCommit'

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

async function saveTweetEmbed (id: string) {
  const url = `https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2F${ACCOUNT_NAME}%2Fstatus%2F${id}&partner=&hide_thread=false`
  const res = await fetch(url)
  if (!res.ok) { return }

  const html: string = (await res.json()).html

  try {
    writeFileSync("tweet_embed.html", html)
  } catch {
    console.error("Failed to save the tweet embed.")
  }
}

async function broadcastCommit (twitterClient: TwitterApiReadWrite, octokitClient: Octokit, commit: Commit): Promise<void> {
  const tweetText = await commitToTweet(octokitClient, commit)
  if (process.env.NODE_ENV === 'production') {
    // const tweetResult = await twitterClient.v2.tweet({ text: tweetText })
    // if (tweetResult.errors != null) {
    //   throw new Error(tweetResult.errors.toString())
    // }
    // console.log(tweetResult.data.text)
    // await saveTweetEmbed(tweetResult.data.id)
    await saveTweetEmbed('1708330647519981758')
  }
  await saveTweetEmbed('1708330647519981758')
  console.log(tweetText)
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

async function handleTweetCommit (twitterClient: TwitterApiReadWrite, octokitClient: Octokit, mongoClient: MongoClient): Promise<void> {
  const commit = await popLatestMongoCommit(mongoClient)
  if (commit == null) {
    console.log("No fresh commits found.")
    return
  }
  await broadcastCommit(twitterClient, octokitClient, commit)
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

  try {
    await handleTweetCommit(twitterClient, octokitClient, mongoClient)
  } finally {
    await mongoClient.close()
  }
}

main().catch(console.error)
