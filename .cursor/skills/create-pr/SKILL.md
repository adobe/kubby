# Create PR

Use this skill when the user asks to create a PR when requested (e.g. "create pr").

## Steps

1. **Stage and review ALL changes.** Run `git status -uall` and `git diff` to understand the full scope of what changed.
   Include every changed and new file — do not summarize only a subset.

2. **Create a branch.** Name it `<kebab-case-summary>` derived from the changes.
   Example: `add-rate-limit-config`
   Example: `fix-unbounded-cache-limit`

   ```sh
   git checkout -b add-rate-limit-config
   ```

   Rebase with main if necessary.

3. **Commit.** Follow
    - Subject: `add rate limit config` (imperative mood, no period, max 72 chars).
    - Body: explain *what* and *why*, wrapped at 72 chars.
    - Be concise and terse, the body should be short especially for small changes.

   ### Commit message rules

    - Separate subject from body with a blank line.
    - Do not end the subject line with a period.
    - Capitalize the subject line and each paragraph.
    - Imperative mood ("add feature", not "added feature").
    - Wrap lines at 72 characters.
    - Body explains what and why, not how.

4. **Push and create the PR.**

   ```sh
   git push -u origin HEAD
   gh pr create --title "add rate limit config" --body "$(cat <<'EOF'
   Brief description of what changed and why.
   EOF
   )"
   ```

    - **Title** mirrors the commit subject: `<imperative summary>`.
    - **Body** is terse and to the point: a few sentences or bullet points covering what changed and why.
    - The title and body must reflect ALL changes, not just a subset.
    - Do NOT add any footer like "Made with Cursor" or similar — keep the body clean.

5. **Return the PR URL** to the user. Suggest to use `gh pr merge` when approved and checks are passing.
