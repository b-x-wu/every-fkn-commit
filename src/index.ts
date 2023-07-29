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

async function getCommitsAfterDateTime (octokitClient: Octokit, query: string, dateTime: string): Promise<Commit[]> {
  const fullQuery: string = `${query} author-date:>${dateTime}`
  const commits: Commit[] = []

  let complete = false
  for (let page = 1; !complete; page++) {
    const commitSearchResults = await octokitClient.rest.search.commits({ q: fullQuery, page })
    complete = !commitSearchResults.data.incomplete_results
    commits.push(...commitSearchResults.data.items.map<Commit>((commitResult) => {
      return {
        url: commitResult.html_url,
        sha: commitResult.sha,
        date: commitResult.commit.author.date,
        author: commitResult.author?.login,
        message: commitResult.commit.message
      }
    }))
  }  
  return commits
}

// TODO
// Get and store all commits with "fuck" that came after the most recent one gotten
//    get the time of the most recent one gotten
//    get all commits that come after a certain time (the most recent one)
//    store all commits that were gotten
// Fetch the oldest stored commit and delete it
//    fetch the oldest one
//    tweet it
//    delete it

async function main () {
  const octokitClient = new Octokit({})
  // console.log(await getCommits(octokitClient, 'Q'))
  console.log(await getCommitsAfterDateTime(octokitClient, 'Q', '2023-07-01T16:15:49.000+05:30'))
}

main().catch(console.error)
