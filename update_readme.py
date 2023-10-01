if __name__ == "__main__":
    template = """# Every Fucking Commit

A Twitter bot that gathers every commit on GitHub with "fuck" in the commit message. Find the bot [@EveryFknCommit](https://twitter.com/EveryFknCommit).

## Latest Tweet

<tweet_embed>

"""
    try:
        with open("tweet_embed.html") as fin:
            tweet_embed = fin.read()
            readme_text = template.replace("<tweet_embed>", tweet_embed)

        with open("README.md", 'w') as fout:
            fout.write(readme_text)
    except FileNotFoundError:
        print("Error updating README.md. Embeded tweet not found.")
    except Exception:
        print("Error updating README.md")
