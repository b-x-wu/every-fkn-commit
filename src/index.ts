import { Octokit } from "octokit"

interface Commit {
  url: string // html_url
  sha: string
  date: string // author date
  author?: string // author login
  message: string
}

async function getCommits (octokitClient: Octokit, query: string): Promise<Commit[]> {
  const commitSearchResults = await octokitClient.rest.search.commits({
    q: query,
    sort: 'author-date',
    order: 'desc',
  })
  return commitSearchResults.data.items.map<Commit>((commitResult) => {
    return {
      url: commitResult.html_url,
      sha: commitResult.sha,
      date: commitResult.commit.author.date,
      author: commitResult.author?.login,
      message: commitResult.commit.message
    }
  })
}

async function getMostRecentCommit(octokitClient: Octokit, query: string): Promise<Commit | null> {
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
    date: commitSearchResults.data.items[0].commit.author.date,
    author: commitSearchResults.data.items[0].author?.login,
    message: commitSearchResults.data.items[0].commit.message,
  }
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
  const octokitClient = new Octokit({})
  // console.log(await getCommits(octokitClient, 'Q'))
  console.log(await getMostRecentCommit(octokitClient, 'fuck'))
}

main().catch(console.error)
